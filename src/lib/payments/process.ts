import type { PrismaClient } from "@prisma/client";
import { cancelOrder } from "../orders/cancel";
import { markPaid, recordPaymentEvent, type Dispatcher } from "../orders/mark-paid";
import type { MpClient } from "./mercadopago";
import { mpOrderAction, mpOrderEventStatus } from "./mp-status";

/**
 * Notificación de MP (tópico `order`) → pedido (docs/05). La order se consulta a la API (nunca el
 * body). Idempotente por `PaymentEvent(provider, externalId = id de la order, status/status_detail)`.
 */

export type ProcessResult =
  | { result: "unknown-order" }
  | {
      result:
        | "paid"
        | "already-paid"
        | "duplicate"
        | "late"
        | "waiting"
        | "ignored"
        | "cancelled"
        | "attention";
    };

export async function processMpOrder(
  db: PrismaClient,
  mp: Pick<MpClient, "getOrder">,
  mpOrderId: string,
  opts: { now?: Date; dispatch?: Dispatcher } = {},
): Promise<ProcessResult> {
  const now = opts.now ?? new Date();
  const mpOrder = await mp.getOrder(mpOrderId);
  const orderId = mpOrder.external_reference;
  const order = orderId
    ? await db.order.findUnique({
        where: { id: orderId },
        select: { id: true, total: true, status: true, paymentDueAt: true, paymentMethod: true },
      })
    : null;
  if (!order || order.paymentMethod !== "MP") return { result: "unknown-order" };

  const event = {
    provider: "MP" as const,
    externalId: mpOrder.id,
    status: mpOrderEventStatus(mpOrder),
    amount: Math.round(mpOrder.total_paid_amount ?? 0),
  };
  const action = mpOrderAction(mpOrder, order, now);

  switch (action.kind) {
    case "pay": {
      const r = await markPaid(db, order.id, {
        event,
        by: "mercadopago",
        now,
        dispatch: opts.dispatch,
      });
      return { result: r.status === "duplicate-event" ? "duplicate" : r.status };
    }
    case "wait": {
      const fresh = await recordPaymentEvent(db, order.id, event, async (tx) => {
        if (action.holdUntil && order.status === "PENDING_PAYMENT") {
          // Efectivo: la reserva dura lo que el ticket (nunca se acorta).
          await tx.order.updateMany({
            where: {
              id: order.id,
              status: "PENDING_PAYMENT",
              paymentDueAt: { lt: action.holdUntil },
            },
            data: { paymentDueAt: action.holdUntil },
          });
        }
      });
      return { result: fresh ? "waiting" : "duplicate" };
    }
    case "ignore": {
      const fresh = await recordPaymentEvent(db, order.id, event);
      return { result: fresh ? "ignored" : "duplicate" };
    }
    case "cancel": {
      // cancelOrder es idempotente (noop si ya está cancelado): se registra el evento después.
      await cancelOrder(db, order.id, action.reason, { by: "mercadopago" });
      const fresh = await recordPaymentEvent(db, order.id, event);
      return { result: fresh ? "cancelled" : "duplicate" };
    }
    case "attention": {
      const fresh = await recordPaymentEvent(db, order.id, event, async (tx) => {
        await tx.order.update({
          where: { id: order.id },
          data: { needsAttention: true, attentionNote: `Mercado Pago: ${action.reason}.` },
        });
      });
      return { result: fresh ? "attention" : "duplicate" };
    }
  }
}
