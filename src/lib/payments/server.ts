import "server-only";
import { db } from "../db";
import { env } from "../env";
import { integrationLogger } from "../sm/log";
import { dispatchOrder } from "../sm/dispatch";
import { requireSmClient } from "../sm/server";
import { createMpClient, type MpClient } from "./mercadopago";
import type { OrderForPayment, PaymentProvider } from "./provider";

/** Mercado Pago y transferencia dentro de Next. `MP_ACCESS_TOKEN` es obligatoria solo acá. */

let mp: MpClient | undefined;

export function mpClient(): MpClient {
  if (mp) return mp;
  const { MP_ACCESS_TOKEN, MP_API_BASE_URL } = env();
  if (!MP_ACCESS_TOKEN) throw new Error("Falta MP_ACCESS_TOKEN");
  mp = createMpClient({
    accessToken: MP_ACCESS_TOKEN,
    baseUrl: MP_API_BASE_URL,
    log: integrationLogger(db(), "MP"),
  });
  return mp;
}

export function orderUrl(o: Pick<OrderForPayment, "code" | "trackingToken">): string {
  return `${env().SITE_URL}/pedido/${o.code}?t=${encodeURIComponent(o.trackingToken)}`;
}

export const mercadoPago: PaymentProvider = {
  id: "MP",
  async start(order) {
    const pref = await mpClient().createPreference({
      orderId: order.id,
      code: order.code,
      total: order.total,
      returnUrl: orderUrl(order),
      notificationUrl: `${env().SITE_URL}/api/webhooks/mercadopago`,
      expiresAt: order.paymentDueAt,
      now: new Date(),
    });
    return { kind: "redirect", url: pref.init_point };
  },
};

export const transfer: PaymentProvider = {
  id: "TRANSFER",
  async start(order) {
    return { kind: "instructions", url: orderUrl(order) };
  },
};

/** Despacho a SM al pagarse (Fase 3). Sin SM_API_KEY tira y el cron lo reintenta. */
export async function dispatchToSm(orderId: string) {
  return dispatchOrder(db(), requireSmClient(), orderId);
}
