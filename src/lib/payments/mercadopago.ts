import { randomUUID } from "node:crypto";
import { z } from "zod";
import { config } from "../config";
import type { SmLogEntry } from "../sm/client";
import { mpOrderSchema, type MpOrder } from "./mp-status";

/**
 * Mercado Pago Checkout Pro con la API de Orders (docs/05). Sin SDK: `fetch` + Zod, como SM.
 * Campos según la doc oficial de Checkout Pro (Orders): "Crear y configurar una order de pago",
 * "Configurar URLs de retorno", "Cambiar fecha de vencimiento" y "Configurar descripción de factura".
 * Sin `server-only`: lo usan scripts. El token llega por parámetro (ver `payments/server.ts`).
 * Logs sin PII: acción, status y código de pedido.
 */

export type MpClientOptions = {
  accessToken: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  log?: (e: SmLogEntry) => Promise<void> | void;
  timeoutMs?: number;
  /** Clave de idempotencia por intento (inyectable en tests). */
  idempotencyKey?: () => string;
};

export type CheckoutOrderInput = {
  orderId: string;
  code: string;
  total: number;
  /** URL absoluta de /pedido/[code]?t=… (vuelta desde MP). */
  returnUrl: string;
};

export const checkoutOrderResponseSchema = z.looseObject({
  id: z.string(),
  checkout_url: z.string().url(),
});

export class MpError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "MpError";
  }
}

/** Montos como string con 2 decimales, como en la doc ("1000.00"). */
export const mpAmount = (pesos: number) => pesos.toFixed(2);

/**
 * Body de la order. Un solo ítem NEUTRO por el total: nunca nombres de producto ni datos del
 * comprador (`payer` es opcional). El webhook se configura en "Tus integraciones" (tópico Order):
 * la API de Orders no recibe `notification_url`.
 *
 * Vigencia: `expiration_time` cierra la order y cancela los pagos pendientes, así que tiene que
 * cubrir el ticket de efectivo (`default_payment_due_date`). La reserva corta (`mpHoldHours`) la
 * maneja nuestro cron; un pago con tarjeta después de vencida la reserva cae en `late` (Eric).
 */
export function buildCheckoutOrder(p: CheckoutOrderInput) {
  const https = p.returnUrl.startsWith("https://");
  const amount = mpAmount(p.total);
  return {
    type: "online",
    processing_mode: "manual",
    total_amount: amount,
    external_reference: p.orderId,
    expiration_time: `P${config.cashTicketDays + 1}D`,
    items: [{ title: config.mp.itemTitle, quantity: 1, unit_price: amount }],
    config: {
      statement_descriptor: config.mp.statementDescriptor,
      // Efectivo (Rapipago / Pago Fácil). MP recomienda ≥ 3 días.
      default_payment_due_date: `P${config.cashTicketDays}D`,
      online: {
        success_url: p.returnUrl,
        pending_url: p.returnUrl,
        failure_url: p.returnUrl,
        // MP rechaza URLs locales: en desarrollo sin túnel no hay vuelta automática.
        ...(https ? { auto_return: "approved" } : {}),
      },
    },
  };
}

export function createMpClient(opts: MpClientOptions) {
  const baseUrl = (opts.baseUrl ?? config.mp.apiBaseUrl).replace(/\/+$/, "");
  const doFetch = opts.fetch ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const newKey = opts.idempotencyKey ?? randomUUID;

  async function log(e: SmLogEntry) {
    try {
      await opts.log?.(e);
    } catch {
      // el log nunca tumba el pago
    }
  }

  async function call<T extends z.ZodType>(
    action: string,
    path: string,
    schema: T,
    init: {
      method?: string;
      body?: unknown;
      orderCode?: string;
      retries?: number;
      idempotencyKey?: string;
    },
  ): Promise<z.infer<T>> {
    const retries = init.retries ?? 0;
    let last: MpError | undefined;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await doFetch(baseUrl + path, {
          method: init.method ?? "GET",
          headers: {
            Authorization: `Bearer ${opts.accessToken}`,
            Accept: "application/json",
            ...(init.body ? { "Content-Type": "application/json" } : {}),
            ...(init.idempotencyKey ? { "X-Idempotency-Key": init.idempotencyKey } : {}),
          },
          body: init.body ? JSON.stringify(init.body) : undefined,
          signal: AbortSignal.timeout(timeoutMs),
          cache: "no-store",
        });
        const json: unknown = await res.json().catch(() => null);
        if (!res.ok) {
          const msg =
            json && typeof json === "object" && "message" in json
              ? String(json.message)
              : `HTTP ${res.status}`;
          last = new MpError(msg.slice(0, 300), res.status);
          if (res.status >= 500 || res.status === 429) continue;
          break;
        }
        const parsed = schema.safeParse(json);
        if (!parsed.success) {
          last = new MpError("Respuesta de Mercado Pago inesperada", res.status);
          break;
        }
        return parsed.data;
      } catch (e) {
        last = new MpError(
          e instanceof Error && e.name === "TimeoutError" ? "Timeout" : "Error de red",
        );
      }
    }
    await log({
      action,
      ok: false,
      httpStatus: last?.status,
      orderCode: init.orderCode,
      message: last?.message,
    });
    throw last ?? new MpError("Error desconocido");
  }

  return {
    /** Crea la order de Checkout Pro. La misma clave en los reintentos: nunca duplica. */
    async createCheckoutOrder(p: CheckoutOrderInput) {
      const order = await call("mp.order", "/v1/orders", checkoutOrderResponseSchema, {
        method: "POST",
        body: buildCheckoutOrder(p),
        orderCode: p.code,
        retries: 1,
        idempotencyKey: newKey(),
      });
      await log({ action: "mp.order", ok: true, orderCode: p.code });
      return order;
    },
    /** La order SIEMPRE se consulta a la API: nunca se confía en el body del webhook. */
    getOrder(id: string): Promise<MpOrder> {
      return call("mp.order.get", `/v1/orders/${encodeURIComponent(id)}`, mpOrderSchema, {
        retries: 2,
      });
    },
  };
}

export type MpClient = ReturnType<typeof createMpClient>;
