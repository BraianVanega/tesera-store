import { z } from "zod";
import { config } from "../config";
import type { SmLogEntry } from "../sm/client";
import { mpPaymentSchema, type MpPayment } from "./mp-status";

/**
 * Mercado Pago Checkout Pro por REST (docs/05). Sin SDK: `fetch` + Zod, como el cliente de SM.
 * Campos según la referencia oficial de Create Preference y Get Payment.
 * Sin `server-only`: lo usan scripts. El token llega por parámetro (ver `payments/server.ts`).
 * Logs sin PII: acción, status y código de pedido.
 */

export type MpClientOptions = {
  accessToken: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  log?: (e: SmLogEntry) => Promise<void> | void;
  timeoutMs?: number;
};

export type PreferenceInput = {
  orderId: string;
  code: string;
  total: number;
  /** URL absoluta de /pedido/[code]?t=… (vuelta desde MP). */
  returnUrl: string;
  /** URL absoluta del webhook. */
  notificationUrl: string;
  /** Hasta cuándo se puede pagar (la reserva del pedido). */
  expiresAt: Date;
  now: Date;
};

export const preferenceResponseSchema = z.looseObject({
  id: z.string(),
  init_point: z.string().url(),
  sandbox_init_point: z.string().url().nullish(),
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

/** Fecha en el formato de la doc (`2017-02-01T12:00:00.000-04:00`), en hora de Argentina (−03:00). */
export function mpDate(d: Date): string {
  const ar = new Date(d.getTime() - 3 * 3_600_000);
  return ar.toISOString().replace("Z", "-03:00");
}

/** Body de la preferencia. Un solo ítem NEUTRO por el total: nunca nombres de producto. */
export function buildPreference(p: PreferenceInput) {
  const https = (u: string) => u.startsWith("https://");
  return {
    items: [
      {
        id: p.code,
        title: config.mp.itemTitle,
        quantity: 1,
        unit_price: p.total,
        currency_id: "ARS",
      },
    ],
    external_reference: p.orderId,
    // MP rechaza URLs locales: en desarrollo sin túnel no hay webhook ni vuelta automática.
    ...(https(p.notificationUrl) ? { notification_url: p.notificationUrl } : {}),
    back_urls: { success: p.returnUrl, pending: p.returnUrl, failure: p.returnUrl },
    ...(https(p.returnUrl) ? { auto_return: "approved" } : {}),
    statement_descriptor: config.mp.statementDescriptor,
    expires: true,
    expiration_date_from: mpDate(p.now),
    expiration_date_to: mpDate(p.expiresAt),
    // Efectivo (Rapipago / Pago Fácil): vencimiento del ticket. MP recomienda ≥ 3 días.
    date_of_expiration: mpDate(new Date(p.now.getTime() + config.cashTicketDays * 86_400_000)),
  };
}

export function createMpClient(opts: MpClientOptions) {
  const baseUrl = (opts.baseUrl ?? config.mp.apiBaseUrl).replace(/\/+$/, "");
  const doFetch = opts.fetch ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 10_000;

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
    init: { method?: string; body?: unknown; orderCode?: string; retries?: number },
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
    async createPreference(p: PreferenceInput) {
      const pref = await call("mp.preference", "/checkout/preferences", preferenceResponseSchema, {
        method: "POST",
        body: buildPreference(p),
        orderCode: p.code,
      });
      await log({ action: "mp.preference", ok: true, orderCode: p.code });
      return pref;
    },
    /** El pago SIEMPRE se consulta a la API: nunca se confía en el body del webhook. */
    getPayment(id: string): Promise<MpPayment> {
      return call("mp.payment", `/v1/payments/${encodeURIComponent(id)}`, mpPaymentSchema, {
        retries: 2,
      });
    },
  };
}

export type MpClient = ReturnType<typeof createMpClient>;
