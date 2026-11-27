/**
 * Abstracción de medios de pago (docs/05). Hoy: Mercado Pago (Checkout Pro) y transferencia.
 * Plan B (cripto u otro procesador): un adapter más con la misma idempotencia y `markPaid`.
 */
export type PaymentProviderId = "MP" | "TRANSFER";

export type OrderForPayment = {
  id: string;
  code: string;
  total: number;
  trackingToken: string;
  paymentDueAt: Date;
};

export type CheckoutStart =
  { kind: "redirect"; url: string } | { kind: "instructions"; url: string };

export interface PaymentProvider {
  id: PaymentProviderId;
  /** Arranca el cobro: redirect al procesador o la página con instrucciones. */
  start(order: OrderForPayment): Promise<CheckoutStart>;
}
