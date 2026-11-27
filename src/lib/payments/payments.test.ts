import { describe, expect, it, vi } from "vitest";
import { ORDER_CODE_RE, orderCode, safeTokenEqual, trackingToken } from "../orders/code";
import { buildCheckoutOrder, createMpClient, mpAmount } from "./mercadopago";
import { mpOrderAction, mpOrderEventStatus, mpOrderSchema } from "./mp-status";
import { parseSignatureHeader, signatureManifest, signForTest, verifyMpSignature } from "./webhook";

const now = new Date("2026-11-26T15:00:00Z");
const mpo = (over: Record<string, unknown> = {}) =>
  mpOrderSchema.parse({
    id: "ORDTST01KS5AJ6HTK2HRQ3XJ3C2JCKP9",
    status: "processed",
    status_detail: "accredited",
    external_reference: "ord_1",
    total_amount: "51460.00",
    total_paid_amount: "51460.00",
    currency: "ARS",
    created_date: "2026-11-26T15:00:00.000Z",
    transactions: { payments: [{ status: "processed", payment_method: { type: "credit_card" } }] },
    ...over,
  });
const ticket = { payments: [{ status: "action_required", payment_method: { type: "ticket" } }] };

describe("estado de la order de MP → acción", () => {
  const order = { total: 51_460 };

  it("procesada y acreditada con el monto exacto → pagar", () => {
    expect(mpOrderAction(mpo(), order, now)).toEqual({ kind: "pay" });
    expect(mpOrderEventStatus(mpo())).toBe("processed/accredited");
    expect(mpOrderEventStatus({ status: "created", status_detail: null })).toBe("created");
  });
  it("otro monto, otra moneda o reembolso parcial → atención, nunca pagar", () => {
    expect(mpOrderAction(mpo({ total_paid_amount: "100.00" }), order, now)).toEqual({
      kind: "attention",
      reason: "monto pagado 100 ≠ total 51460",
    });
    expect(mpOrderAction(mpo({ total_paid_amount: null }), order, now).kind).toBe("attention");
    expect(mpOrderAction(mpo({ currency: "USD" }), order, now).kind).toBe("attention");
    expect(mpOrderAction(mpo({ status_detail: "partially_refunded" }), order, now)).toEqual({
      kind: "attention",
      reason: "reembolso parcial de Mercado Pago",
    });
  });
  it("pendiente con tarjeta → esperar sin tocar la reserva", () => {
    for (const status of ["created", "processing", "action_required"]) {
      expect(mpOrderAction(mpo({ status }), order, now)).toEqual({ kind: "wait" });
    }
    expect(mpOrderAction(mpo({ status: "processing", transactions: null }), order, now)).toEqual({
      kind: "wait",
    });
  });
  it("ticket de efectivo → la reserva dura lo que el ticket (desde la creación de la order)", () => {
    const withDate = mpOrderAction(
      mpo({ status: "action_required", status_detail: "waiting_payment", transactions: ticket }),
      order,
      now,
    );
    expect(withDate).toEqual({ kind: "wait", holdUntil: new Date("2026-11-29T21:00:00.000Z") });
    const noDate = mpOrderAction(
      mpo({ status: "action_required", created_date: null, transactions: ticket }),
      order,
      new Date("2026-11-27T15:00:00Z"),
    );
    expect(noDate).toEqual({ kind: "wait", holdUntil: new Date("2026-11-30T21:00:00.000Z") });
  });
  it("fallida, cancelada o vencida → nada (sigue pendiente hasta vencer)", () => {
    expect(mpOrderAction(mpo({ status: "failed" }), order, now)).toEqual({ kind: "ignore" });
    expect(
      mpOrderAction(mpo({ status: "canceled", status_detail: "expired" }), order, now),
    ).toEqual({ kind: "ignore" });
  });
  it("reembolso, contracargo y desconocido", () => {
    expect(mpOrderAction(mpo({ status: "refunded" }), order, now)).toEqual({
      kind: "cancel",
      reason: "reembolso de Mercado Pago",
    });
    expect(mpOrderAction(mpo({ status: "charged_back" }), order, now).kind).toBe("cancel");
    expect(mpOrderAction(mpo({ status: "raro" }), order, now)).toEqual({
      kind: "attention",
      reason: "estado de MP desconocido: raro",
    });
  });
});

describe("firma del webhook", () => {
  const secret = "secreto-de-prueba";
  const base = { dataId: "123456", requestId: "req-1", ts: "1704908010", secret };

  it("válida", () => {
    const signature = signForTest(base);
    expect(verifyMpSignature({ signature, requestId: "req-1", dataId: "123456", secret })).toBe(
      true,
    );
  });
  it("rechaza otra clave, otro id, otro request-id o header roto", () => {
    const signature = signForTest(base);
    expect(
      verifyMpSignature({ signature, requestId: "req-1", dataId: "123456", secret: "otra" }),
    ).toBe(false);
    expect(verifyMpSignature({ signature, requestId: "req-1", dataId: "999", secret })).toBe(false);
    expect(verifyMpSignature({ signature, requestId: "req-2", dataId: "123456", secret })).toBe(
      false,
    );
    expect(verifyMpSignature({ signature: "ts=1", requestId: "req-1", dataId: "1", secret })).toBe(
      false,
    );
    expect(verifyMpSignature({ signature: null, requestId: null, dataId: null, secret })).toBe(
      false,
    );
    expect(verifyMpSignature({ signature, requestId: "req-1", dataId: "123456", secret: "" })).toBe(
      false,
    );
  });
  it("plantilla: id en minúsculas, partes ausentes omitidas", () => {
    expect(signatureManifest("ORD01JQ4S4KY8HWQ6NA5PXB65B3D3", "r", "1")).toBe(
      "id:ord01jq4s4ky8hwq6na5pxb65b3d3;request-id:r;ts:1;",
    );
    expect(signatureManifest("a-b", null, "1")).toBe("id:a-b;ts:1;");
    expect(signatureManifest(null, null, "1")).toBe("ts:1;");
    expect(parseSignatureHeader(" ts=1 , v1=ab=c")).toEqual({ ts: "1", v1: "ab=c" });
  });
});

describe("order de Checkout Pro", () => {
  const input = {
    orderId: "ord_1",
    code: "TS-7K3QX9",
    total: 56_900,
    returnUrl: "https://tesera.com.ar/pedido/TS-7K3QX9?t=tok",
  };

  it("un ítem neutro por el total, sin datos del comprador", () => {
    const b = buildCheckoutOrder(input);
    expect(b).toEqual({
      type: "online",
      processing_mode: "manual",
      total_amount: "56900.00",
      external_reference: "ord_1",
      expiration_time: "P4D",
      items: [{ title: "Pedido Tésera", quantity: 1, unit_price: "56900.00" }],
      config: {
        statement_descriptor: "TESERA",
        default_payment_due_date: "P3D",
        online: {
          success_url: input.returnUrl,
          pending_url: input.returnUrl,
          failure_url: input.returnUrl,
          auto_return: "approved",
        },
      },
    });
    expect(JSON.stringify(b)).not.toMatch(/payer|email|notification_url/);
  });
  it("en local (http) no manda auto_return", () => {
    const b = buildCheckoutOrder({ ...input, returnUrl: "http://localhost:3000/x" });
    expect(b.config.online).not.toHaveProperty("auto_return");
  });
  it("montos con dos decimales", () => {
    expect(mpAmount(1)).toBe("1.00");
  });
});

describe("cliente de MP", () => {
  const reply = (status: number, body: unknown) =>
    new Response(body === undefined ? "x" : JSON.stringify(body), { status });

  it("crea la order con Bearer e idempotencia, reintenta con la MISMA clave y registra sin PII", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(reply(500, { message: "caído" }))
      .mockResolvedValueOnce(
        reply(201, {
          id: "ORDTST1",
          checkout_url: "https://www.mercadopago.com.ar/checkout/v1/redirect?order_id=ORDTST1",
        }),
      );
    const logs: unknown[] = [];
    const mp = createMpClient({
      accessToken: "TEST-x",
      baseUrl: "https://mp.test/",
      fetch: f as never,
      log: (e) => void logs.push(e),
      idempotencyKey: () => "key-1",
    });
    const o = await mp.createCheckoutOrder({
      orderId: "o",
      code: "TS-1",
      total: 1,
      returnUrl: "https://a/b",
    });
    expect(o.checkout_url).toContain("order_id=ORDTST1");
    expect(f).toHaveBeenCalledTimes(2);
    for (const [url, init] of f.mock.calls as unknown as [string, RequestInit][]) {
      expect(url).toBe("https://mp.test/v1/orders");
      const h = init.headers as Record<string, string>;
      expect(h.Authorization).toBe("Bearer TEST-x");
      expect(h["X-Idempotency-Key"]).toBe("key-1");
    }
    expect(logs).toEqual([{ action: "mp.order", ok: true, orderCode: "TS-1" }]);
  });

  it("cada intento de pago usa una clave nueva", async () => {
    const f = vi.fn(async () => reply(201, { id: "O", checkout_url: "https://mp.test/c" }));
    const mp = createMpClient({ accessToken: "t", fetch: f as never });
    const input = { orderId: "o", code: "TS-1", total: 1, returnUrl: "https://a/b" };
    await mp.createCheckoutOrder(input);
    await mp.createCheckoutOrder(input);
    const keys = (f.mock.calls as unknown as [string, RequestInit][]).map(
      ([, i]) => (i.headers as Record<string, string>)["X-Idempotency-Key"],
    );
    expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(keys[0]).not.toBe(keys[1]);
  });

  it("consulta una order y reintenta ante 5xx o red", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(reply(503, { message: "caído" }))
      .mockRejectedValueOnce(Object.assign(new Error(), { name: "TimeoutError" }))
      .mockResolvedValueOnce(reply(200, { id: "ORD5", status: "processed" }));
    const mp = createMpClient({ accessToken: "t", fetch: f });
    expect((await mp.getOrder("ORD5")).status).toBe("processed");
    expect(f.mock.calls[0][0]).toBe("https://api.mercadopago.com/v1/orders/ORD5");
    expect((f.mock.calls[0][1] as RequestInit).headers).not.toHaveProperty("X-Idempotency-Key");
  });

  it("errores: 4xx con mensaje, respuesta inválida, sin JSON y log que falla", async () => {
    const make = (...r: Response[]) => {
      const f = vi.fn();
      for (const x of r) f.mockResolvedValueOnce(x);
      return createMpClient({
        accessToken: "t",
        fetch: f,
        log: () => {
          throw new Error("db");
        },
      });
    };
    await expect(make(reply(404, { message: "not found" })).getOrder("1")).rejects.toMatchObject({
      message: "not found",
      status: 404,
    });
    await expect(make(reply(200, { nada: 1 })).getOrder("1")).rejects.toMatchObject({
      message: "Respuesta de Mercado Pago inesperada",
    });
    await expect(make(reply(400, undefined)).getOrder("1")).rejects.toMatchObject({
      message: "HTTP 400",
    });
    const net = createMpClient({
      accessToken: "t",
      fetch: vi.fn().mockRejectedValue(new TypeError("x")),
    });
    await expect(net.getOrder("1")).rejects.toMatchObject({ message: "Error de red" });
  });
});

describe("códigos de pedido y tokens", () => {
  it("formato legible, sin caracteres ambiguos", () => {
    for (let i = 0; i < 200; i++) expect(orderCode()).toMatch(ORDER_CODE_RE);
    expect(orderCode(() => 0)).toBe("TS-222222");
    expect(ORDER_CODE_RE.test("TS-0O1IL2")).toBe(false);
  });
  it("token largo y comparación segura", () => {
    const t = trackingToken();
    expect(t).toMatch(/^[\w-]{32}$/);
    expect(trackingToken()).not.toBe(t);
    expect(safeTokenEqual(t, t)).toBe(true);
    expect(safeTokenEqual(`${t}x`, t)).toBe(false);
    expect(safeTokenEqual(null, t)).toBe(false);
  });
});
