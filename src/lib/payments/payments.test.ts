import { describe, expect, it, vi } from "vitest";
import { ORDER_CODE_RE, orderCode, safeTokenEqual, trackingToken } from "../orders/code";
import { buildPreference, createMpClient, mpDate } from "./mercadopago";
import { mpPaymentAction, mpPaymentSchema } from "./mp-status";
import { parseSignatureHeader, signatureManifest, signForTest, verifyMpSignature } from "./webhook";

const now = new Date("2026-11-26T15:00:00Z");
const pay = (over: Record<string, unknown> = {}) =>
  mpPaymentSchema.parse({
    id: 999,
    status: "approved",
    status_detail: "accredited",
    external_reference: "ord_1",
    transaction_amount: "51460.00",
    currency_id: "ARS",
    payment_type_id: "credit_card",
    ...over,
  });

describe("estado de pago de MP → acción", () => {
  const order = { total: 51_460 };

  it("aprobado con el monto exacto → pagar", () => {
    expect(pay().id).toBe("999");
    expect(mpPaymentAction(pay(), order, now)).toEqual({ kind: "pay" });
  });
  it("aprobado con otro monto o moneda → atención, nunca pagar", () => {
    expect(mpPaymentAction(pay({ transaction_amount: 100 }), order, now)).toEqual({
      kind: "attention",
      reason: "monto pagado 100 ≠ total 51460",
    });
    expect(mpPaymentAction(pay({ currency_id: "USD" }), order, now).kind).toBe("attention");
  });
  it("pendiente con tarjeta → esperar sin tocar la reserva", () => {
    expect(mpPaymentAction(pay({ status: "in_process" }), order, now)).toEqual({ kind: "wait" });
    expect(mpPaymentAction(pay({ status: "authorized" }), order, now)).toEqual({ kind: "wait" });
  });
  it("ticket de efectivo → la reserva dura lo que el ticket", () => {
    const withExp = mpPaymentAction(
      pay({
        status: "pending",
        payment_type_id: "ticket",
        date_of_expiration: "2026-11-29T23:59:59.000-03:00",
      }),
      order,
      now,
    );
    expect(withExp).toEqual({ kind: "wait", holdUntil: new Date("2026-11-30T08:59:59.000Z") });
    const noExp = mpPaymentAction(
      pay({ status: "pending", payment_type_id: "ticket" }),
      order,
      now,
    );
    expect(noExp).toEqual({ kind: "wait", holdUntil: new Date("2026-11-29T21:00:00.000Z") });
  });
  it("rechazado/cancelado → nada (sigue pendiente hasta vencer)", () => {
    expect(mpPaymentAction(pay({ status: "rejected" }), order, now)).toEqual({ kind: "ignore" });
    expect(mpPaymentAction(pay({ status: "cancelled" }), order, now)).toEqual({ kind: "ignore" });
  });
  it("reembolso, contracargo, mediación y desconocido", () => {
    expect(mpPaymentAction(pay({ status: "refunded" }), order, now)).toEqual({
      kind: "cancel",
      reason: "reembolso de Mercado Pago",
    });
    expect(mpPaymentAction(pay({ status: "charged_back" }), order, now).kind).toBe("cancel");
    expect(mpPaymentAction(pay({ status: "in_mediation" }), order, now).kind).toBe("attention");
    expect(mpPaymentAction(pay({ status: "raro" }), order, now)).toEqual({
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
    expect(signatureManifest("ABC123", "r", "1")).toBe("id:abc123;request-id:r;ts:1;");
    expect(signatureManifest("a-b", null, "1")).toBe("id:a-b;ts:1;");
    expect(signatureManifest(null, null, "1")).toBe("ts:1;");
    expect(parseSignatureHeader(" ts=1 , v1=ab=c")).toEqual({ ts: "1", v1: "ab=c" });
  });
});

describe("preferencia de Checkout Pro", () => {
  const input = {
    orderId: "ord_1",
    code: "TS-7K3QX9",
    total: 56_900,
    returnUrl: "https://tesera.com.ar/pedido/TS-7K3QX9?t=tok",
    notificationUrl: "https://tesera.com.ar/api/webhooks/mercadopago",
    expiresAt: new Date("2026-11-26T17:00:00Z"),
    now,
  };

  it("un ítem neutro por el total, sin datos del comprador", () => {
    const b = buildPreference(input);
    expect(b).toEqual({
      items: [
        {
          id: "TS-7K3QX9",
          title: "Pedido Tésera",
          quantity: 1,
          unit_price: 56_900,
          currency_id: "ARS",
        },
      ],
      external_reference: "ord_1",
      notification_url: input.notificationUrl,
      back_urls: { success: input.returnUrl, pending: input.returnUrl, failure: input.returnUrl },
      auto_return: "approved",
      statement_descriptor: "TESERA",
      expires: true,
      expiration_date_from: "2026-11-26T12:00:00.000-03:00",
      expiration_date_to: "2026-11-26T14:00:00.000-03:00",
      date_of_expiration: "2026-11-29T12:00:00.000-03:00",
    });
    expect(JSON.stringify(b)).not.toMatch(/payer|email/);
  });
  it("en local (http) no manda webhook ni auto_return", () => {
    const b = buildPreference({
      ...input,
      returnUrl: "http://localhost:3000/x",
      notificationUrl: "http://localhost:3000/w",
    });
    expect(b).not.toHaveProperty("notification_url");
    expect(b).not.toHaveProperty("auto_return");
  });
  it("mpDate en hora de Argentina", () => {
    expect(mpDate(new Date("2026-01-01T03:00:00Z"))).toBe("2026-01-01T00:00:00.000-03:00");
  });
});

describe("cliente de MP", () => {
  const reply = (status: number, body: unknown) =>
    new Response(body === undefined ? "x" : JSON.stringify(body), { status });

  it("crea la preferencia con Bearer y registra sin PII", async () => {
    const f = vi.fn(async () =>
      reply(201, { id: "pref_1", init_point: "https://mp.test/start?pref_id=1" }),
    );
    const logs: unknown[] = [];
    const mp = createMpClient({
      accessToken: "TEST-x",
      baseUrl: "https://mp.test/",
      fetch: f as never,
      log: (e) => void logs.push(e),
    });
    const pref = await mp.createPreference({
      orderId: "o",
      code: "TS-1",
      total: 1,
      returnUrl: "https://a/b",
      notificationUrl: "https://a/w",
      expiresAt: now,
      now,
    });
    expect(pref.init_point).toBe("https://mp.test/start?pref_id=1");
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://mp.test/checkout/preferences");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer TEST-x");
    expect(logs).toEqual([{ action: "mp.preference", ok: true, orderCode: "TS-1" }]);
  });

  it("consulta un pago y reintenta ante 5xx o red", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(reply(503, { message: "caído" }))
      .mockRejectedValueOnce(Object.assign(new Error(), { name: "TimeoutError" }))
      .mockResolvedValueOnce(
        reply(200, { id: 5, status: "approved", transaction_amount: 10, currency_id: "ARS" }),
      );
    const mp = createMpClient({ accessToken: "t", fetch: f });
    expect((await mp.getPayment("5")).status).toBe("approved");
    expect(f.mock.calls[0][0]).toBe("https://api.mercadopago.com/v1/payments/5");
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
    await expect(make(reply(404, { message: "not found" })).getPayment("1")).rejects.toMatchObject({
      message: "not found",
      status: 404,
    });
    await expect(make(reply(200, { nada: 1 })).getPayment("1")).rejects.toMatchObject({
      message: "Respuesta de Mercado Pago inesperada",
    });
    await expect(make(reply(400, undefined)).getPayment("1")).rejects.toMatchObject({
      message: "HTTP 400",
    });
    const net = createMpClient({
      accessToken: "t",
      fetch: vi.fn().mockRejectedValue(new TypeError("x")),
    });
    await expect(net.getPayment("1")).rejects.toMatchObject({ message: "Error de red" });
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
