import { z } from "zod";
import { config } from "../config";
import { toPesos } from "../domain/pricing";

/**
 * Pago de Mercado Pago → qué hacer con el pedido (docs/05). Pura.
 * Campos según la referencia oficial de `GET /v1/payments/{id}` (status, status_detail,
 * external_reference, transaction_amount, currency_id, payment_type_id).
 */

export const mpPaymentSchema = z.looseObject({
  id: z.union([z.number(), z.string()]).transform(String),
  status: z.string(),
  status_detail: z.string().nullish(),
  external_reference: z.string().nullish(),
  transaction_amount: z.coerce.number(),
  currency_id: z.string(),
  payment_type_id: z.string().nullish(),
  date_of_expiration: z.string().nullish(),
});
export type MpPayment = z.infer<typeof mpPaymentSchema>;

export type MpAction =
  | { kind: "pay" }
  /** Pendiente: si es efectivo (ticket), se extiende la reserva hasta `holdUntil`. */
  | { kind: "wait"; holdUntil?: Date }
  /** Rechazado/cancelado: el pedido sigue pendiente hasta vencer; el cliente puede reintentar. */
  | { kind: "ignore" }
  | { kind: "cancel"; reason: string }
  /** Algo no cierra (monto, moneda, disputa, estado desconocido): lo mira Eric. */
  | { kind: "attention"; reason: string };

export function mpPaymentAction(
  p: Pick<
    MpPayment,
    "status" | "transaction_amount" | "currency_id" | "payment_type_id" | "date_of_expiration"
  >,
  order: { total: number },
  now: Date,
): MpAction {
  switch (p.status) {
    case "approved": {
      if (p.currency_id !== "ARS") return { kind: "attention", reason: `moneda ${p.currency_id}` };
      const paid = toPesos(p.transaction_amount);
      if (paid !== order.total) {
        return { kind: "attention", reason: `monto pagado ${paid} ≠ total ${order.total}` };
      }
      return { kind: "pay" };
    }
    case "pending":
    case "in_process":
    case "authorized": {
      if (p.payment_type_id !== "ticket") return { kind: "wait" };
      const extra = config.cashHoldExtraHours * 3_600_000;
      const exp = p.date_of_expiration ? Date.parse(p.date_of_expiration) : NaN;
      const base = Number.isNaN(exp) ? now.getTime() + config.cashTicketDays * 86_400_000 : exp;
      return { kind: "wait", holdUntil: new Date(base + extra) };
    }
    case "rejected":
    case "cancelled":
      return { kind: "ignore" };
    case "refunded":
      return { kind: "cancel", reason: "reembolso de Mercado Pago" };
    case "charged_back":
      return { kind: "cancel", reason: "contracargo de Mercado Pago" };
    case "in_mediation":
      return { kind: "attention", reason: "pago en disputa (mediación de MP)" };
    default:
      return { kind: "attention", reason: `estado de MP desconocido: ${p.status}` };
  }
}
