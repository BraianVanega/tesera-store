import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { isAuthorizedCron } from "../cron";
import { createSmClient, retryAfterMs, SmError, syncBudgetOk, type SmLogEntry } from "./client";
import { buildSmOrder, type DispatchableOrder } from "./dispatch";
import { buildQuoteRequest, createQuoter, createTtlCache, mapQuote, quoteCacheKey } from "./quote";
import {
  smAgenciesDataSchema,
  smErrorSchema,
  smOk,
  smOrderCreatedSchema,
  smOrderStatusSchema,
  smProvincesDataSchema,
  smQuoteDataSchema,
  smStockDataSchema,
} from "./schemas";
import { statusUpdate } from "./status";
import { maxUpdatedAt } from "./sync";

const fixture = (name: string): unknown =>
  JSON.parse(
    readFileSync(new URL(`../../../tests/fixtures/sm/${name}.json`, import.meta.url), "utf8"),
  );
const data = (name: string) => (fixture(name) as { data: unknown }).data;

// ── Schemas contra los ejemplos de la doc oficial ─────────────────────

describe("schemas de SM", () => {
  it.each([
    ["stock", smStockDataSchema],
    ["provincias", smProvincesDataSchema],
    ["quote", smQuoteDataSchema],
    ["quote-interior", smQuoteDataSchema],
    ["agencies", smAgenciesDataSchema],
    ["order-created", smOrderCreatedSchema],
    ["order-existing", smOrderCreatedSchema],
    ["order-status", smOrderStatusSchema],
  ] as const)("%s valida", (name, schema) => {
    expect(smOk(schema).safeParse(fixture(name)).success).toBe(true);
  });

  it("error documentado", () => {
    expect(smErrorSchema.parse(fixture("error")).error).toBe("mensaje");
  });

  it("warnings por defecto vacío", () => {
    const r = smOrderCreatedSchema.parse({
      pedidoId: 1,
      externalOrderId: "X",
      estado: "INGESTADO",
    });
    expect(r.warnings).toEqual([]);
  });

  it("rechaza una opción de envío sin code", () => {
    const bad = structuredClone(data("quote")) as { options: { code: string }[] };
    bad.options[0].code = "";
    expect(smQuoteDataSchema.safeParse(bad).success).toBe(false);
  });
});

// ── Cliente ───────────────────────────────────────────────────────────

type Reply = { status?: number; body?: unknown; headers?: Record<string, string>; throws?: Error };

function fakeFetch(replies: Reply[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = vi.fn(async (url: URL | RequestInfo, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const r = replies.shift() ?? { status: 500, body: { ok: false, error: "sin respuesta" } };
    if (r.throws) throw r.throws;
    return new Response(r.body === undefined ? "no-json" : JSON.stringify(r.body), {
      status: r.status ?? 200,
      headers: r.headers,
    });
  });
  return { fn: fn as unknown as typeof fetch, calls };
}

function client(replies: Reply[], extra: { maxRetries?: number } = {}) {
  const f = fakeFetch(replies);
  const logs: SmLogEntry[] = [];
  const sleeps: number[] = [];
  const c = createSmClient({
    apiKey: "sm_test",
    baseUrl: "https://sm.test/",
    fetch: f.fn,
    log: (e) => {
      logs.push(e);
    },
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    maxRetries: extra.maxRetries ?? 3,
  });
  return { c, calls: f.calls, logs, sleeps };
}

describe("cliente de SM", () => {
  it("manda Bearer, arma la query y valida la respuesta", async () => {
    const { c, calls } = client([{ body: fixture("stock") }]);
    const page = await c.stockPage(2, 50);
    expect(page.items).toHaveLength(3);
    expect(calls[0].url).toBe("https://sm.test/api/v1/stock?page=2&pageSize=50");
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer sm_test");
  });

  it("POST con JSON y Content-Type", async () => {
    const { c, calls } = client([{ body: fixture("quote") }]);
    await c.quote(buildQuoteRequest({ cp: "1824", items: [{ sku: "ABC123", cantidad: 1 }] }));
    expect(calls[0].init.method).toBe("POST");
    expect((calls[0].init.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json",
    );
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      destino: { cp: "1824" },
      items: [{ sku: "ABC123", cantidad: 1 }],
    });
  });

  it("lee los headers de cupo", async () => {
    const { c } = client([
      {
        body: fixture("provincias"),
        headers: {
          "X-RateLimit-Limit": "60",
          "X-RateLimit-Remaining": "59",
          "X-RateLimit-Daily-Limit": "1000",
          "X-RateLimit-Daily-Remaining": "900",
        },
      },
    ]);
    await c.provinces();
    expect(c.rateState()).toEqual({
      limit: 60,
      remaining: 59,
      dailyLimit: 1000,
      dailyRemaining: 900,
    });
  });

  it("429 respeta Retry-After y reintenta", async () => {
    const { c, sleeps } = client([
      { status: 429, body: { ok: false, error: "rate" }, headers: { "Retry-After": "3" } },
      { body: fixture("provincias") },
    ]);
    await c.provinces();
    expect(sleeps).toEqual([3000, 500]);
  });

  it("429 con espera larga (tope diario) corta sin esperar y lo registra", async () => {
    const { c, sleeps, logs } = client([
      { status: 429, body: { ok: false, error: "rate" }, headers: { "Retry-After": "40000" } },
    ]);
    await expect(c.provinces()).rejects.toMatchObject({ code: "rate_limited", status: 429 });
    expect(sleeps).toEqual([]);
    expect(logs).toEqual([
      {
        action: "provinces",
        ok: false,
        httpStatus: 429,
        orderCode: undefined,
        message: "Límite de SM excedido (429)",
      },
    ]);
  });

  it("429 sin Retry-After no reintenta", async () => {
    const { c, calls } = client([{ status: 429, body: { ok: false, error: "rate" } }]);
    await expect(c.provinces()).rejects.toBeInstanceOf(SmError);
    expect(calls).toHaveLength(1);
  });

  it("429 en el último intento no espera más", async () => {
    const r429 = { status: 429, body: { ok: false, error: "r" }, headers: { "Retry-After": "1" } };
    const { c, calls } = client([r429, r429], { maxRetries: 1 });
    await expect(c.provinces()).rejects.toMatchObject({ code: "rate_limited" });
    expect(calls).toHaveLength(2);
  });

  it("5xx y timeouts se reintentan con backoff", async () => {
    const timeout = Object.assign(new Error("t"), { name: "TimeoutError" });
    const { c, sleeps } = client([
      { status: 503, body: { ok: false, error: "caído" } },
      { throws: timeout },
      { throws: new TypeError("fetch failed") },
      { body: fixture("provincias") },
    ]);
    expect((await c.provinces()).total).toBe(3);
    expect(sleeps).toEqual([500, 1000, 2000]);
  });

  it("se rinde tras los reintentos con el último error", async () => {
    const { c, logs } = client(
      [
        { throws: new TypeError("x") },
        { throws: Object.assign(new Error(), { name: "AbortError" }) },
      ],
      { maxRetries: 1 },
    );
    await expect(c.provinces()).rejects.toMatchObject({ code: "timeout" });
    expect(logs[0]).toMatchObject({ ok: false, message: "Timeout (10000 ms)" });
  });

  it("4xx no se reintenta y usa el mensaje de SM", async () => {
    const { c, calls } = client([{ status: 422, body: { ok: false, error: "SKU inexistente" } }]);
    await expect(c.quote({ destino: { cp: "1824" } })).rejects.toMatchObject({
      code: "http",
      status: 422,
      message: "SKU inexistente",
    });
    expect(calls).toHaveLength(1);
  });

  it("error sin el formato documentado", async () => {
    const { c } = client([{ status: 400, body: { raro: true } }]);
    await expect(c.provinces()).rejects.toMatchObject({ message: "HTTP 400" });
  });

  it("respuesta no JSON: reintenta si es 5xx, corta si no", async () => {
    const a = client([{ status: 502 }, { body: fixture("provincias") }]);
    expect((await a.c.provinces()).total).toBe(3);
    const b = client([{ status: 200 }]);
    await expect(b.c.provinces()).rejects.toMatchObject({ code: "invalid" });
    expect(b.calls).toHaveLength(1);
  });

  it("respuesta OK con forma inesperada → invalid (no se reintenta)", async () => {
    const { c, calls } = client([{ body: { ok: true, data: { items: "x" } } }]);
    await expect(c.provinces()).rejects.toMatchObject({ code: "invalid" });
    expect(calls).toHaveLength(1);
    const d = client([{ body: { hola: 1 } }]);
    await expect(d.c.provinces()).rejects.toMatchObject({ code: "invalid" });
  });

  it("con poco cupo diario frena el sync pero no cotizaciones ni pedidos", async () => {
    const low = { "X-RateLimit-Daily-Limit": "1000", "X-RateLimit-Daily-Remaining": "100" };
    const { c, calls, logs } = client([
      { body: fixture("provincias"), headers: low },
      { body: fixture("quote") },
    ]);
    await c.provinces();
    await expect(c.stockPage(1)).rejects.toMatchObject({ code: "budget" });
    await expect(c.productsPage(1)).rejects.toMatchObject({ code: "budget" });
    await expect(c.modifiedPage("2026-01-01T00:00:00", 1)).rejects.toMatchObject({
      code: "budget",
    });
    await c.quote({ destino: { cp: "1824" } });
    expect(calls).toHaveLength(2);
    expect(logs.filter((l) => l.message?.includes("Cupo"))).toHaveLength(3);
  });

  it("crear pedido: idempotente, registra sin PII", async () => {
    const { c, logs, calls } = client([
      { status: 201, body: fixture("order-created") },
      { body: fixture("order-existing") },
    ]);
    const built = buildSmOrder(order());
    if (!built.ok) throw new Error("orden de prueba incompleta");
    const first = await c.createOrder(built.body);
    const again = await c.createOrder(built.body);
    expect(first.warnings).toHaveLength(1);
    expect(again.yaExistia).toBe(true);
    expect(again.pedidoId).toBe(first.pedidoId);
    expect(logs).toEqual([
      { action: "orders.create", ok: true, orderCode: "TS-7K3QX9", message: "warnings=1" },
      { action: "orders.create", ok: true, orderCode: "TS-7K3QX9", message: "yaExistia" },
    ]);
    expect(JSON.stringify(logs)).not.toMatch(/Ana|Siempre Viva|223/);
    expect(calls[0].url).toBe("https://sm.test/api/v1/orders");
  });

  it("estado de pedido: datos o null si SM no lo conoce", async () => {
    const { c, calls } = client([
      { body: fixture("order-status") },
      { status: 404, body: { ok: false, error: "no existe" } },
    ]);
    expect((await c.orderStatus("TS 1"))?.trackingCode).toBe("1234567890");
    expect(await c.orderStatus("TS-2")).toBeNull();
    expect(calls[0].url).toBe("https://sm.test/api/v1/orders/TS%201");
  });

  it("agencias y página de modificados", async () => {
    const { c, calls } = client([{ body: fixture("agencies") }, { body: fixture("products") }]);
    expect((await c.agencies(4, "1824")).items[0].codigo).toBe("1824A");
    await c.modifiedPage("2026-06-24T00:00:00", 1);
    expect(calls[0].url).toBe("https://sm.test/api/v1/shipping/agencies?provinciaId=4&cp=1824");
    expect(calls[1].url).toContain("/api/v1/products/modificados?desde=2026-06-24T00%3A00%3A00");
  });

  it("un logger que falla no rompe la llamada", async () => {
    const c = createSmClient({
      apiKey: "sm_x",
      fetch: fakeFetch([{ status: 400, body: { ok: false, error: "x" } }]).fn,
      log: () => {
        throw new Error("db caída");
      },
    });
    await expect(c.provinces()).rejects.toMatchObject({ message: "x" });
  });
});

describe("helpers de cupo", () => {
  it("retryAfterMs: segundos, fecha y basura", () => {
    expect(retryAfterMs("2")).toBe(2000);
    expect(retryAfterMs(null)).toBeNull();
    expect(retryAfterMs("nada")).toBeNull();
    const now = Date.parse("2026-11-26T12:00:00Z");
    expect(retryAfterMs("Thu, 26 Nov 2026 12:00:10 GMT", now)).toBe(10_000);
  });
  it("syncBudgetOk", () => {
    const base = { limit: null, remaining: null };
    expect(syncBudgetOk({ ...base, dailyLimit: null, dailyRemaining: null })).toBe(true);
    expect(syncBudgetOk({ ...base, dailyLimit: 100, dailyRemaining: 20 }, 20)).toBe(true);
    expect(syncBudgetOk({ ...base, dailyLimit: 100, dailyRemaining: 19 }, 20)).toBe(false);
    expect(syncBudgetOk({ ...base, dailyLimit: 0, dailyRemaining: 0 }, 20)).toBe(true);
  });
});

// ── Cotización ────────────────────────────────────────────────────────

describe("cotización", () => {
  const quote = smQuoteDataSchema.parse(data("quote"));
  const interior = smQuoteDataSchema.parse(data("quote-interior"));

  it("con moova-flex es AMBA; opciones ordenadas por precio, en pesos y con preparación", () => {
    const q = mapQuote("1824", quote, "checkout", 1);
    expect(q.zone).toBe("AMBA");
    expect(q.options.map((o) => [o.code, o.price, o.minDays, o.maxDays, o.toAgency])).toEqual([
      ["moova-flex", 7085, 1, 2, false],
      ["ca-cp-suc", 8270, 3, 6, true],
      ["ca-cp-dom", 13303, 3, 6, false],
    ]);
  });

  it("sin moova-flex es Interior (aunque el CP sea de CABA)", () => {
    expect(mapQuote("1425", interior, "cart").zone).toBe("INTERIOR");
  });

  it("el quoteId solo se usa en el checkout", () => {
    expect(mapQuote("1824", quote, "cart")).toMatchObject({ quoteId: null, expiresAt: null });
    expect(mapQuote("1824", quote, "checkout")).toMatchObject({
      quoteId: "q_9f2c8a71b04e4d6f8c1e5a3b7d904f21",
      expiresAt: "2026-07-29T18:40:00",
    });
    expect(mapQuote("5000", interior, "checkout").quoteId).toBeNull();
  });

  it("empate de precio se ordena por code", () => {
    const tie = { ...interior, options: interior.options.map((o) => ({ ...o, precio: 100 })) };
    expect(mapQuote("5000", tie, "cart").options.map((o) => o.code)).toEqual([
      "ca-cp-dom",
      "ca-cp-suc",
    ]);
  });

  it("request: con ítems sin paquete; sin ítems con el bulto de referencia", () => {
    expect(
      buildQuoteRequest({
        cp: " 1824 ",
        provinciaId: 4,
        localidad: "Lanus",
        calle: "Siempre Viva",
        numero: "742",
        agencyId: "1824A",
        items: [{ sku: "A", cantidad: 1 }],
      }),
    ).toEqual({
      destino: {
        cp: "1824",
        provinciaId: 4,
        localidad: "Lanus",
        calle: "Siempre Viva",
        numero: "742",
        agencyId: "1824A",
      },
      items: [{ sku: "A", cantidad: 1 }],
    });
    expect(buildQuoteRequest({ cp: "5000", items: [] })).toEqual({
      destino: { cp: "5000" },
      paquete: { pesoGr: 500, altoCm: 10, anchoCm: 15, largoCm: 20 },
    });
  });

  it("la clave de cache ignora el orden de los ítems y separa carrito de checkout", () => {
    const a = {
      cp: "1824",
      items: [
        { sku: "B", cantidad: 1 },
        { sku: "A", cantidad: 2 },
      ],
    };
    const b = {
      cp: "1824",
      items: [
        { sku: "A", cantidad: 2 },
        { sku: "B", cantidad: 1 },
      ],
    };
    expect(quoteCacheKey(a, "cart")).toBe(quoteCacheKey(b, "cart"));
    expect(quoteCacheKey(a, "cart")).not.toBe(quoteCacheKey(a, "checkout"));
    expect(quoteCacheKey({ ...a, calle: "X", numero: "1" }, "checkout")).not.toBe(
      quoteCacheKey(a, "checkout"),
    );
  });

  it("cache con vencimiento y tope", () => {
    let t = 0;
    const cache = createTtlCache<number>(1000, 2, () => t);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3); // saca "a"
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBe(2);
    t = 1001;
    expect(cache.get("b")).toBeUndefined();
  });

  it("el cotizador no repite la llamada a SM", async () => {
    const quoteFn = vi.fn(async () => quote);
    const q = createQuoter({ quote: quoteFn });
    const input = { cp: "1824", items: [{ sku: "A", cantidad: 1 }] };
    await q(input, "checkout");
    const again = await q(input, "checkout");
    expect(quoteFn).toHaveBeenCalledTimes(1);
    expect(again.quoteId).toBe("q_9f2c8a71b04e4d6f8c1e5a3b7d904f21");
  });
});

// ── Despacho ──────────────────────────────────────────────────────────

function order(over: Partial<DispatchableOrder> = {}): DispatchableOrder {
  return {
    code: "TS-7K3QX9",
    total: 49_980,
    customerName: "Ana Pérez",
    customerPhone: "2235551234",
    street: "Av. Siempre Viva",
    streetNumber: "742",
    floor: null,
    locality: "Lanus",
    postalCode: "1824",
    provinceId: 4,
    province: "Buenos Aires",
    shippingCode: "ca-cp-dom",
    quoteId: "q_123",
    agencyId: null,
    lines: [{ sku: "ABC123", quantity: 2 }],
    ...over,
  };
}

describe("buildSmOrder", () => {
  it("arma el body con el code como externalOrderId y SIN email ni comprador", () => {
    const r = buildSmOrder(order({ floor: " 3 B " }));
    expect(r).toEqual({
      ok: true,
      body: {
        externalOrderId: "TS-7K3QX9",
        envio: {
          nombre: "Ana Pérez",
          telefono: "2235551234",
          calle: "Av. Siempre Viva",
          numero: "742",
          piso: "3 B",
          localidad: "Lanus",
          codigoPostal: "1824",
          provincia: "Buenos Aires",
          provinciaId: 4,
          shippingCode: "ca-cp-dom",
          quoteId: "q_123",
        },
        items: [{ sku: "ABC123", cantidad: 2 }],
        totalVentaFinal: 49_980,
        moneda: "ARS",
      },
    });
    expect(JSON.stringify(r)).not.toMatch(/email|comprador|@/);
  });

  it("suma el mismo SKU y manda la sucursal en opciones -suc", () => {
    const r = buildSmOrder(
      order({
        shippingCode: "ca-cp-suc",
        agencyId: "1824A",
        provinceId: null,
        lines: [
          { sku: "A", quantity: 1 },
          { sku: "A", quantity: 2 },
        ],
      }),
    );
    expect(r.ok && r.body.items).toEqual([{ sku: "A", cantidad: 3 }]);
    expect(r.ok && r.body.envio).toMatchObject({ agencyId: "1824A" });
    expect(r.ok && "provinciaId" in r.body.envio).toBe(false);
  });

  it("lista lo que falta en vez de inventarlo", () => {
    expect(
      buildSmOrder(
        order({ quoteId: null, customerPhone: " ", shippingCode: "ca-cp-suc", lines: [] }),
      ),
    ).toEqual({ ok: false, missing: ["telefono", "quoteId", "items", "agencyId"] });
  });
});

// ── Estado ────────────────────────────────────────────────────────────

describe("statusUpdate", () => {
  const base = { status: "FULFILLING" as const, supplierStatus: null, trackingCode: null };

  it("con tracking pasa a SHIPPED y guarda el valor crudo", () => {
    expect(statusUpdate(base, { fulfillmentStatus: "despachado", trackingCode: "123" })).toEqual({
      supplierStatus: "despachado",
      newRawStatus: "despachado",
      trackingCode: "123",
      status: "SHIPPED",
    });
  });

  it("'despachado' sin tracking también es enviado", () => {
    expect(statusUpdate(base, { fulfillmentStatus: "Despachado", trackingCode: null }).status).toBe(
      "SHIPPED",
    );
  });

  it("un valor desconocido se guarda crudo pero no cambia el estado", () => {
    expect(statusUpdate(base, { fulfillmentStatus: "en_preparacion" })).toEqual({
      supplierStatus: "en_preparacion",
      newRawStatus: "en_preparacion",
    });
  });

  it("sin cambios → nada", () => {
    expect(
      statusUpdate(
        { status: "SHIPPED", supplierStatus: "despachado", trackingCode: "1" },
        { fulfillmentStatus: "despachado", trackingCode: "1" },
      ),
    ).toEqual({});
  });

  it("si SM borra el estado se limpia sin loguear valor nuevo", () => {
    expect(
      statusUpdate(
        { ...base, supplierStatus: "x" },
        { fulfillmentStatus: null, trackingCode: null },
      ),
    ).toEqual({ supplierStatus: null });
  });

  it("nunca hace una transición inválida", () => {
    expect(
      statusUpdate({ ...base, status: "CANCELLED" }, { trackingCode: "9", fulfillmentStatus: null })
        .status,
    ).toBeUndefined();
  });
});

describe("varios", () => {
  it("maxUpdatedAt", () => {
    const p = (u: string | undefined) => ({ ultimaActualizacion: u }) as never;
    expect(maxUpdatedAt(null, [])).toBeNull();
    expect(
      maxUpdatedAt("2026-06-01T00:00:00", [
        p("2026-06-25T16:35:10"),
        p(undefined),
        p("2026-05-01T00:00:00"),
      ]),
    ).toBe("2026-06-25T16:35:10");
  });

  it("isAuthorizedCron", () => {
    const secret = "s".repeat(32);
    expect(isAuthorizedCron(`Bearer ${secret}`, secret)).toBe(true);
    expect(isAuthorizedCron(`Bearer ${secret}x`, secret)).toBe(false);
    expect(isAuthorizedCron(null, secret)).toBe(false);
    expect(isAuthorizedCron(`Bearer ${secret}`, undefined)).toBe(false);
  });
});
