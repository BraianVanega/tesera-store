import { z } from "zod";
import { config } from "../config";
import { toPesos } from "../domain/pricing";

/**
 * Order de Mercado Pago → qué hacer con el pedido (docs/05). Pura.
 * Campos según la doc oficial de la API de Orders (`GET /v1/orders/{id}`, "Estado de la order"):
 * status, status_detail, external_reference, total_amount, total_paid_amount, currency,
 * created_date y transactions.payments[].payment_method.type.
 */

export const mpOrderSchema = z.looseObject({
  id: z.string(),
  status: z.string(),
  status_detail: z.string().nullish(),
  external_reference: z.string().nullish(),
  total_paid_amount: z.coerce.number().nullish(),
  currency: z.string().nullish(),
  created_date: z.string().nullish(),
  transactions: z
    .looseObject({
      payments: z
        .array(
          z.looseObject({
            status: z.string().nullish(),
            payment_method: z.looseObject({ type: z.string().nullish() }).nullish(),
          }),
        )
        .nullish(),
    })
    .nullish(),
});
export type MpOrder = z.infer<typeof mpOrderSchema>;

export type MpAction =
  | { kind: "pay" }
  /** Pendiente: si es efectivo (ticket), se extiende la reserva hasta `holdUntil`. */
  | { kind: "wait"; holdUntil?: Date }
  /** Fallida/cancelada/vencida: el pedido sigue pendiente hasta vencer; el cliente puede reintentar. */
  | { kind: "ignore" }
  | { kind: "cancel"; reason: string }
  /** Algo no cierra (monto, moneda, reembolso parcial, estado desconocido): lo mira Eric. */
  | { kind: "attention"; reason: string };

/** Clave de idempotencia del evento: el mismo estado no se aplica dos veces. */
export const mpOrderEventStatus = (o: Pick<MpOrder, "status" | "status_detail">) =>
  o.status_detail ? `${o.status}/${o.status_detail}` : o.status;

const isTicket = (o: Pick<MpOrder, "transactions">) =>
  (o.transactions?.payments ?? []).some((p) => p.payment_method?.type === "ticket");

export function mpOrderAction(
  o: Pick<
    MpOrder,
    "status" | "status_detail" | "total_paid_amount" | "currency" | "created_date" | "transactions"
  >,
  order: { total: number },
  now: Date,
): MpAction {
  switch (o.status) {
    case "processed": {
      if (o.status_detail === "partially_refunded") {
        return { kind: "attention", reason: "reembolso parcial de Mercado Pago" };
      }
      if (o.currency && o.currency !== "ARS") {
        return { kind: "attention", reason: `moneda ${o.currency}` };
      }
      const paid = toPesos(o.total_paid_amount ?? 0);
      if (paid !== order.total) {
        return { kind: "attention", reason: `monto pagado ${paid} ≠ total ${order.total}` };
      }
      return { kind: "pay" };
    }
    case "created":
    case "processing":
    case "action_required": {
      if (!isTicket(o)) return { kind: "wait" };
      // El ticket vence `cashTicketDays` después de creada la order (default_payment_due_date).
      const created = o.created_date ? Date.parse(o.created_date) : NaN;
      const base = Number.isNaN(created) ? now.getTime() : created;
      const holdUntil =
        base + config.cashTicketDays * 86_400_000 + config.cashHoldExtraHours * 3_600_000;
      return { kind: "wait", holdUntil: new Date(holdUntil) };
    }
    case "failed":
    case "canceled":
      return { kind: "ignore" };
    case "refunded":
      return { kind: "cancel", reason: "reembolso de Mercado Pago" };
    case "charged_back":
      return { kind: "cancel", reason: "contracargo de Mercado Pago" };
    default:
      return { kind: "attention", reason: `estado de MP desconocido: ${o.status}` };
  }
}
