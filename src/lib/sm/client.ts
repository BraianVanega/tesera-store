import { z } from "zod";
import { config } from "../config";
import {
  smAgenciesDataSchema,
  smErrorSchema,
  smOk,
  smOrderCreatedSchema,
  smOrderStatusSchema,
  smProductsDataSchema,
  smProvincesDataSchema,
  smQuoteDataSchema,
  smStockDataSchema,
  type SmOrderRequest,
  type SmQuoteRequest,
} from "./schemas";

/**
 * Cliente de la API de SexShopMayorista (docs/04, docs/sm-api/).
 *
 * - Bearer `sm_…`, timeout, todo lo que vuelve pasa por Zod.
 * - Rate limit: lee `X-RateLimit-*`, respeta `Retry-After` en 429 y reintenta con backoff.
 *   `POST /orders` también se reintenta: SM es idempotente por `externalOrderId`.
 * - Prioridades: con poco cupo diario se frena el sync ("sync"); cotizar y crear pedidos
 *   ("critical") siguen.
 * - Sin `server-only` a propósito: lo usan también los scripts. No importa `env()`: la key llega
 *   por parámetro (ver `server.ts`).
 * - Logs sin PII: acción, status y código de pedido. Nunca bodies.
 */

export type SmPriority = "sync" | "critical";

export type SmLogEntry = {
  action: string;
  ok: boolean;
  httpStatus?: number;
  orderCode?: string;
  message?: string;
};

export type SmClientOptions = {
  apiKey: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  /** Registro en IntegrationLog. Los errores del logger no rompen la llamada. */
  log?: (entry: SmLogEntry) => Promise<void> | void;
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
  maxRetries?: number;
};

export type SmErrorCode = "http" | "timeout" | "network" | "invalid" | "rate_limited" | "budget";

export class SmError extends Error {
  constructor(
    message: string,
    readonly code: SmErrorCode,
    readonly status?: number,
  ) {
    super(message);
    this.name = "SmError";
  }
}

export type SmRateState = {
  limit: number | null;
  remaining: number | null;
  dailyLimit: number | null;
  dailyRemaining: number | null;
};

const num = (v: string | null) => (v != null && v !== "" && Number.isFinite(+v) ? +v : null);

/** Segundos de `Retry-After` (o fecha HTTP) → ms. */
export function retryAfterMs(header: string | null, now = Date.now()): number | null {
  if (!header) return null;
  const secs = num(header);
  if (secs != null) return Math.max(0, secs * 1000);
  const at = Date.parse(header);
  return Number.isNaN(at) ? null : Math.max(0, at - now);
}

/** ¿Queda cupo diario para el sync? Sin datos (primera llamada) se asume que sí. */
export function syncBudgetOk(
  s: SmRateState,
  floorPct: number = config.sm.syncBudgetFloorPct,
): boolean {
  if (s.dailyLimit == null || s.dailyRemaining == null || s.dailyLimit <= 0) return true;
  return (s.dailyRemaining / s.dailyLimit) * 100 >= floorPct;
}

const NOT_FOUND = Symbol("not-found");

const RETRYABLE = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

type RequestOpts<T extends z.ZodType> = {
  action: string;
  method?: "GET" | "POST";
  path: string;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  schema: T;
  priority: SmPriority;
  orderCode?: string;
  /** 404 → null en vez de error (GET estado de pedido). */
  notFoundAsNull?: boolean;
};

export function createSmClient(opts: SmClientOptions) {
  const baseUrl = (opts.baseUrl ?? config.sm.baseUrl).replace(/\/+$/, "");
  const doFetch = opts.fetch ?? fetch;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const timeoutMs = opts.timeoutMs ?? config.sm.timeoutMs;
  const maxRetries = opts.maxRetries ?? config.sm.maxRetries;
  const rate: SmRateState = {
    limit: null,
    remaining: null,
    dailyLimit: null,
    dailyRemaining: null,
  };

  async function log(entry: SmLogEntry) {
    try {
      await opts.log?.(entry);
    } catch {
      // El log nunca tumba la integración.
    }
  }

  function readRate(h: Headers) {
    rate.limit = num(h.get("X-RateLimit-Limit")) ?? rate.limit;
    rate.remaining = num(h.get("X-RateLimit-Remaining")) ?? rate.remaining;
    rate.dailyLimit = num(h.get("X-RateLimit-Daily-Limit")) ?? rate.dailyLimit;
    rate.dailyRemaining = num(h.get("X-RateLimit-Daily-Remaining")) ?? rate.dailyRemaining;
  }

  async function send<T extends z.ZodType>(
    o: RequestOpts<T>,
  ): Promise<z.infer<T> | typeof NOT_FOUND> {
    if (o.priority === "sync" && !syncBudgetOk(rate)) {
      const err = new SmError("Cupo diario de SM bajo: se frena el sync", "budget");
      await log({ action: o.action, ok: false, message: err.message });
      throw err;
    }

    const url = new URL(baseUrl + o.path);
    for (const [k, v] of Object.entries(o.query ?? {})) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }

    let lastError: SmError | undefined;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (attempt > 0) await sleep(500 * 2 ** (attempt - 1));
      let res: Response;
      try {
        res = await doFetch(url, {
          method: o.method ?? "GET",
          headers: {
            Authorization: `Bearer ${opts.apiKey}`,
            Accept: "application/json",
            ...(o.body !== undefined ? { "Content-Type": "application/json" } : {}),
          },
          body: o.body !== undefined ? JSON.stringify(o.body) : undefined,
          signal: AbortSignal.timeout(timeoutMs),
          cache: "no-store",
        });
      } catch (e) {
        const timeout =
          e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
        lastError = new SmError(
          timeout ? `Timeout (${timeoutMs} ms)` : "Error de red",
          timeout ? "timeout" : "network",
        );
        continue;
      }

      readRate(res.headers);

      if (res.status === 404 && o.notFoundAsNull) return NOT_FOUND;

      if (res.status === 429) {
        const wait = retryAfterMs(res.headers.get("Retry-After"));
        lastError = new SmError("Límite de SM excedido (429)", "rate_limited", 429);
        if (wait == null || wait > config.sm.maxRetryAfterMs || attempt === maxRetries) break;
        await sleep(wait);
        continue;
      }

      let json: unknown;
      try {
        json = await res.json();
      } catch {
        lastError = new SmError(`Respuesta no JSON (${res.status})`, "invalid", res.status);
        if (RETRYABLE.has(res.status)) continue;
        break;
      }

      if (!res.ok) {
        const err = smErrorSchema.safeParse(json);
        lastError = new SmError(
          (err.success ? err.data.error : `HTTP ${res.status}`).slice(0, 300),
          "http",
          res.status,
        );
        if (RETRYABLE.has(res.status)) continue;
        break;
      }

      const envelope = smOk(z.unknown()).safeParse(json);
      const parsed = o.schema.safeParse(envelope.success ? envelope.data.data : undefined);
      if (!parsed.success) {
        const where = parsed.error.issues
          .slice(0, 3)
          .map((i) => i.path.join("."))
          .join(", ");
        lastError = new SmError(`Respuesta de SM inesperada (${where})`, "invalid", res.status);
        break;
      }
      return parsed.data as z.infer<T>;
    }

    const err = lastError ?? new SmError("Error desconocido", "network");
    await log({
      action: o.action,
      ok: false,
      httpStatus: err.status,
      orderCode: o.orderCode,
      message: err.message,
    });
    throw err;
  }

  async function request<T extends z.ZodType>(o: RequestOpts<T>): Promise<z.infer<T>> {
    const r = await send({ ...o, notFoundAsNull: false });
    if (r === NOT_FOUND) throw new SmError("No encontrado", "http", 404); // inalcanzable
    return r;
  }

  return {
    rateState: (): SmRateState => ({ ...rate }),

    productsPage: async (page: number, pageSize: number = config.sm.pageSize) =>
      await request({
        action: "products.page",
        path: "/api/v1/products",
        query: { page, pageSize },
        schema: smProductsDataSchema,
        priority: "sync",
      }),

    modifiedPage: async (desde: string, page: number, pageSize: number = config.sm.pageSize) =>
      await request({
        action: "products.modified",
        path: "/api/v1/products/modificados",
        query: { desde, page, pageSize },
        schema: smProductsDataSchema,
        priority: "sync",
      }),

    stockPage: async (page: number, pageSize: number = config.sm.pageSize) =>
      await request({
        action: "stock.page",
        path: "/api/v1/stock",
        query: { page, pageSize },
        schema: smStockDataSchema,
        priority: "sync",
      }),

    provinces: async () =>
      await request({
        action: "provinces",
        path: "/api/v1/provincias",
        schema: smProvincesDataSchema,
        priority: "critical",
      }),

    quote: async (body: SmQuoteRequest) =>
      await request({
        action: "shipping.quote",
        method: "POST",
        path: "/api/v1/shipping/quotes",
        body,
        schema: smQuoteDataSchema,
        priority: "critical",
      }),

    agencies: async (provinciaId: number, cp?: string) =>
      await request({
        action: "shipping.agencies",
        path: "/api/v1/shipping/agencies",
        query: { provinciaId, cp },
        schema: smAgenciesDataSchema,
        priority: "critical",
      }),

    /** Idempotente por `externalOrderId` (= order.code): se puede reintentar. */
    createOrder: async (body: SmOrderRequest) => {
      const data = await request({
        action: "orders.create",
        method: "POST",
        path: "/api/v1/orders",
        body,
        schema: smOrderCreatedSchema,
        priority: "critical",
        orderCode: body.externalOrderId,
      });
      await log({
        action: "orders.create",
        ok: true,
        orderCode: body.externalOrderId,
        message: data.yaExistia ? "yaExistia" : `warnings=${data.warnings.length}`,
      });
      return data;
    },

    /** `null` si SM no conoce el pedido (404). */
    orderStatus: async (code: string) => {
      const r = await send({
        action: "orders.status",
        path: `/api/v1/orders/${encodeURIComponent(code)}`,
        schema: smOrderStatusSchema,
        priority: "sync",
        orderCode: code,
        notFoundAsNull: true,
      });
      return r === NOT_FOUND ? null : r;
    },
  };
}

export type SmClient = ReturnType<typeof createSmClient>;
