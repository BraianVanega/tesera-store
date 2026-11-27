import { Prisma, type PrismaClient } from "@prisma/client";

/**
 * ÚNICA función de "se pagó" (docs/05): la usan el webhook de MP, la verificación de Eric
 * (transferencia) y cualquier proveedor futuro.
 *
 * Idempotente por dos lados:
 * - `PaymentEvent @@unique([provider, externalId, status])`: el mismo evento no se procesa dos veces
 *   (se inserta en la MISMA transacción que el cambio de estado: si algo falla, no queda marcado).
 * - El paso a PAID es condicional (`status = PENDING_PAYMENT`): dos pagos distintos no duplican.
 *
 * En la transacción: PAID + venta del stock LOCAL reservado (StockMovement SALE) + encargos.
 * Después (fuera de la transacción): despacho a SM si hay líneas DROPSHIP. Si SM falla, el pedido
 * queda PAID y lo reintenta el cron (`retryDispatch`).
 */

export type PaymentEventInput = {
  provider: "MP" | "TRANSFER";
  externalId: string;
  status: string;
  amount?: number;
};

export type MarkPaidResult =
  | { status: "paid"; dispatched: boolean; dispatchError?: string }
  | { status: "already-paid" }
  | { status: "duplicate-event" }
  /** Pagó con el pedido ya cancelado (venció): queda para Eric (devolver o reactivar). */
  | { status: "late" };

export type Dispatcher = (orderId: string) => Promise<unknown>;

function isUniqueViolation(e: unknown) {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

export async function markPaid(
  db: PrismaClient,
  orderId: string,
  opts: { event: PaymentEventInput; by?: string; now?: Date; dispatch?: Dispatcher },
): Promise<MarkPaidResult> {
  const now = opts.now ?? new Date();
  let result: MarkPaidResult;
  let hasDropship = false;

  try {
    result = await db.$transaction(async (tx) => {
      await tx.paymentEvent.create({ data: { orderId, ...opts.event } });

      const moved = await tx.order.updateMany({
        where: { id: orderId, status: "PENDING_PAYMENT" },
        data: { status: "PAID", paidAt: now, verifiedBy: opts.by ?? null },
      });
      if (moved.count === 0) {
        const o = await tx.order.findUniqueOrThrow({
          where: { id: orderId },
          select: { status: true },
        });
        if (o.status !== "CANCELLED") return { status: "already-paid" } as const;
        await tx.order.update({
          where: { id: orderId },
          data: {
            needsAttention: true,
            attentionNote: `Pago recibido (${opts.event.provider} ${opts.event.externalId}) con el pedido ya cancelado. Devolver o reactivar.`,
          },
        });
        return { status: "late" } as const;
      }

      const items = await tx.orderItem.findMany({ where: { orderId } });
      for (const i of items.filter((x) => x.source === "LOCAL")) {
        // La reserva se convierte en venta (inventory.commitReservation, en SQL atómico).
        const n = await tx.$executeRaw`
          UPDATE "LocalStock"
          SET "reserved" = "reserved" - ${i.quantity}, "quantity" = "quantity" - ${i.quantity}
          WHERE "productId" = ${i.productId} AND "reserved" >= ${i.quantity} AND "quantity" >= ${i.quantity}`;
        if (n !== 1) throw new Error(`Reserva inconsistente para ${i.productId} en ${orderId}`);
        await tx.stockMovement.create({
          data: {
            productId: i.productId,
            type: "SALE",
            quantity: -i.quantity,
            orderId,
            createdBy: opts.by ?? null,
          },
        });
      }
      const encargos = items.filter((x) => x.source === "ENCARGO");
      if (encargos.length) {
        await tx.encargo.createMany({
          data: encargos.map((i) => ({ orderId, productId: i.productId, quantity: i.quantity })),
        });
      }
      hasDropship = items.some((x) => x.source === "DROPSHIP");
      return { status: "paid", dispatched: false } as const;
    });
  } catch (e) {
    if (isUniqueViolation(e)) return { status: "duplicate-event" };
    throw e;
  }

  if (result.status === "paid" && hasDropship && opts.dispatch) {
    try {
      await opts.dispatch(orderId);
      return { status: "paid", dispatched: true };
    } catch (e) {
      return {
        status: "paid",
        dispatched: false,
        dispatchError: e instanceof Error ? e.message : String(e),
      };
    }
  }
  return result;
}

/**
 * Registra un evento de pago que NO cambia el estado (pendiente, rechazado). Idempotente:
 * devuelve false si ya estaba.
 */
export async function recordPaymentEvent(
  db: PrismaClient,
  orderId: string,
  event: PaymentEventInput,
  extra?: (tx: Prisma.TransactionClient) => Promise<void>,
): Promise<boolean> {
  try {
    await db.$transaction(async (tx) => {
      await tx.paymentEvent.create({ data: { orderId, ...event } });
      await extra?.(tx);
    });
    return true;
  } catch (e) {
    if (isUniqueViolation(e)) return false;
    throw e;
  }
}
