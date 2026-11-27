import type { PrismaClient } from "@prisma/client";
import { orderTransitions, type OrderStatus } from "./transitions";

/**
 * Cancela un pedido (docs/03, docs/05).
 * - PENDIENTE (venció el plazo o lo cancela Eric): libera la reserva de stock LOCAL.
 * - PAGADO (reembolso / contracargo de MP): devuelve al stock lo LOCAL (RETURN), cancela encargos
 *   que todavía no se pidieron y marca `needsAttention` si algo ya salió (encargo pedido o
 *   despacho de SM): eso lo resuelve Eric a mano.
 * Condicional sobre el estado leído: si otro proceso lo cambió en el medio, no hace nada.
 */
export type CancelResult = { status: "cancelled"; from: OrderStatus } | { status: "noop" };

export async function cancelOrder(
  db: PrismaClient,
  orderId: string,
  reason: string,
  opts: { by?: string } = {},
): Promise<CancelResult> {
  return db.$transaction(async (tx) => {
    const order = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { items: true, encargos: true },
    });
    const from = order.status as OrderStatus;
    if (!orderTransitions.can(from, "CANCELLED")) return { status: "noop" } as const;

    const notes: string[] = [];
    if (from !== "PENDING_PAYMENT") {
      if (order.supplierOrderId != null)
        notes.push(`avisar a SM (pedido ${order.supplierOrderId})`);
      if (order.encargos.some((e) => e.status !== "PENDIENTE" && e.status !== "CANCELADO")) {
        notes.push("hay productos ya pedidos al proveedor");
      }
      if (from === "SHIPPED" || from === "DELIVERED") notes.push("el pedido ya había salido");
    }

    const moved = await tx.order.updateMany({
      where: { id: orderId, status: from },
      data: {
        status: orderTransitions.assert(from, "CANCELLED"),
        ...(notes.length
          ? { needsAttention: true, attentionNote: `Cancelado (${reason}): ${notes.join("; ")}.` }
          : {}),
      },
    });
    if (moved.count === 0) return { status: "noop" } as const;

    for (const i of order.items.filter((x) => x.source === "LOCAL")) {
      if (from === "PENDING_PAYMENT") {
        await tx.$executeRaw`
          UPDATE "LocalStock" SET "reserved" = GREATEST("reserved" - ${i.quantity}, 0)
          WHERE "productId" = ${i.productId}`;
      } else if (from === "PAID" || from === "FULFILLING") {
        // Todavía no se entregó: vuelve al stock.
        await tx.$executeRaw`
          UPDATE "LocalStock" SET "quantity" = "quantity" + ${i.quantity}
          WHERE "productId" = ${i.productId}`;
        await tx.stockMovement.create({
          data: {
            productId: i.productId,
            type: "RETURN",
            quantity: i.quantity,
            orderId,
            note: reason,
            createdBy: opts.by ?? null,
          },
        });
      }
    }
    await tx.encargo.updateMany({
      where: { orderId, status: "PENDIENTE" },
      data: { status: "CANCELADO" },
    });
    return { status: "cancelled", from } as const;
  });
}
