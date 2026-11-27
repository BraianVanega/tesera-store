/**
 * Pedidos y pagos contra Postgres real (base de pruebas, se vacía en cada test).
 * Corre solo con TEST_DATABASE_URL. Ver tests/integration/sm.test.ts.
 */
import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cancelOrder } from "../../src/lib/orders/cancel";
import { CheckoutError, createOrder, type CreateOrderInput } from "../../src/lib/orders/create";
import { expireOrders, retryDispatch } from "../../src/lib/orders/jobs";
import { markPaid } from "../../src/lib/orders/mark-paid";
import type { MpClient } from "../../src/lib/payments/mercadopago";
import { mpOrderSchema } from "../../src/lib/payments/mp-status";
import { processMpOrder } from "../../src/lib/payments/process";
import { createPrisma } from "../../src/lib/prisma";
import { COURIER_CODE } from "../../src/lib/shop/checkout";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("pedidos y pagos (integración)", () => {
  let db: PrismaClient;
  const now = new Date();
  const form = {
    name: "Ana Pérez",
    email: "ana@example.com",
    phone: "2235551234",
    locality: "Mar del Plata",
    province: "Buenos Aires",
    street: "Colón",
    number: "1234",
  };

  beforeAll(() => {
    db = createPrisma(url!);
  });
  afterAll(async () => {
    await db.$disconnect();
  });
  beforeEach(async () => {
    await db.$executeRawUnsafe(
      'TRUNCATE "PaymentEvent", "Encargo", "StockMovement", "Order", "OrderItem", "Product", "SupplierOffer", "LocalStock", "IntegrationLog" CASCADE',
    );
  });

  /** gel: consumible con 2 en stock local · vib: sin local, SM con stock (encargo en MdP / dropship afuera). */
  async function seed() {
    const offer = (sku: string, mode: "DROPSHIP" | "STOCK", cost: number) => ({
      supplier: "SM" as const,
      supplierSku: sku,
      mode,
      cost,
      stock: 10,
      stockState: "disponible",
      syncedAt: now,
    });
    const gel = await db.product.create({
      data: {
        slug: "gel",
        name: "Gel",
        price: 11_900,
        category: "lubricantes",
        isConsumable: true,
        published: true,
        localStock: { create: { quantity: 2 } },
        offers: { create: [offer("G1", "STOCK", 4_000)] },
      },
    });
    const vib = await db.product.create({
      data: {
        slug: "vib",
        name: "Vibrador",
        price: 42_500,
        category: "vibradores",
        published: true,
        offers: { create: [offer("V1", "DROPSHIP", 20_000), offer("V1", "STOCK", 18_000)] },
      },
    });
    return { gel, vib };
  }

  const mdp = (
    lines: [string, number][],
    over: Partial<CreateOrderInput> = {},
  ): CreateOrderInput => ({
    cart: { lines: lines.map(([id, qty]) => ({ id, qty })), together: false },
    zone: { zone: "MDP", cp: "7600" },
    form,
    method: "TRANSFER",
    shippingCode: COURIER_CODE,
    now,
    ...over,
  });

  const level = async (productId: string) =>
    db.localStock.findUniqueOrThrow({
      where: { productId },
      select: { quantity: true, reserved: true },
    });

  it("crea el pedido recalculando todo y reserva el stock local", async () => {
    const { gel, vib } = await seed();
    const o = await createOrder(
      db,
      mdp([
        [gel.id, 1],
        [vib.id, 1],
      ]),
    );
    expect(o.code).toMatch(/^TS-/);
    const row = await db.order.findUniqueOrThrow({ where: { id: o.id }, include: { items: true } });
    // gel 11.900 hoy (+2.500 cadete) · vib 42.500 después (gratis) · 10 % OFF sobre 54.400
    expect(row).toMatchObject({
      status: "PENDING_PAYMENT",
      subtotal: 54_400,
      discount: 5_440,
      shippingCharged: 2_500,
      shippingCost: 5_000,
      total: 51_460,
      quoteId: null,
    });
    expect(row.paymentDueAt!.getTime() - now.getTime()).toBe(24 * 3_600_000);
    expect(row.items.map((i) => [i.source, i.unitCost]).sort()).toEqual([
      ["ENCARGO", 18_000],
      ["LOCAL", null],
    ]);
    expect(await level(gel.id)).toEqual({ quantity: 2, reserved: 1 });
  });

  it("no sobrevende: dos compras simultáneas del último stock → una sola reserva", async () => {
    const { gel } = await seed();
    await db.supplierOffer.deleteMany({ where: { productId: gel.id } }); // sin SM: solo stock local
    const results = await Promise.allSettled([
      createOrder(db, mdp([[gel.id, 2]])),
      createOrder(db, mdp([[gel.id, 2]], { method: "MP" })),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(CheckoutError);
    expect(await db.order.count()).toBe(1);
    expect(await level(gel.id)).toEqual({ quantity: 2, reserved: 2 });
  });

  it("fuera de MdP exige la cotización de checkout y la sucursal", async () => {
    const { vib } = await seed();
    const base = mdp([[vib.id, 1]], {
      zone: { zone: "AMBA", cp: "1824" },
      shippingCode: "ca-cp-suc",
    });
    const options = [
      { code: "moova-flex", label: "YIP", toAgency: false, price: 7_085, minDays: 1, maxDays: 2 },
      { code: "ca-cp-suc", label: "Suc", toAgency: true, price: 8_270, minDays: 3, maxDays: 6 },
    ];
    await expect(createOrder(db, base)).rejects.toThrow("Elegí una opción de envío.");
    await expect(createOrder(db, { ...base, quote: { quoteId: null, options } })).rejects.toThrow(
      "No pudimos confirmar el envío",
    );
    await expect(createOrder(db, { ...base, quote: { quoteId: "q_1", options } })).rejects.toThrow(
      "Elegí la sucursal",
    );
    const o = await createOrder(db, {
      ...base,
      quote: { quoteId: "q_1", options, agencyId: "1824A" },
    });
    const row = await db.order.findUniqueOrThrow({ where: { id: o.id }, include: { items: true } });
    // 42.500 ≥ 40.000 (GBA): la más barata gratis → sucursal paga la diferencia.
    expect(row).toMatchObject({
      shippingCharged: 1_185,
      shippingCost: 8_270,
      quoteId: "q_1",
      agencyId: "1824A",
      shippingCode: "ca-cp-suc",
    });
    expect(row.items[0]).toMatchObject({ source: "DROPSHIP", unitCost: 20_000 });
  });

  it("markPaid: una sola venta, encargos y despacho una vez", async () => {
    const { gel, vib } = await seed();
    const o = await createOrder(
      db,
      mdp([
        [gel.id, 1],
        [vib.id, 1],
      ]),
    );
    const dispatch = vi.fn(async () => {});
    const event = { provider: "TRANSFER" as const, externalId: "manual-1", status: "verified" };

    expect(await markPaid(db, o.id, { event, by: "eric", dispatch })).toEqual({
      status: "paid",
      dispatched: false,
    });
    expect(await markPaid(db, o.id, { event, dispatch })).toEqual({ status: "duplicate-event" });
    expect(await markPaid(db, o.id, { event: { ...event, externalId: "manual-2" } })).toEqual({
      status: "already-paid",
    });

    expect(await db.order.findUniqueOrThrow({ where: { id: o.id } })).toMatchObject({
      status: "PAID",
      verifiedBy: "eric",
    });
    expect(await level(gel.id)).toEqual({ quantity: 1, reserved: 0 });
    expect(await db.stockMovement.findMany({ select: { type: true, quantity: true } })).toEqual([
      { type: "SALE", quantity: -1 },
    ]);
    expect(await db.encargo.findMany({ select: { productId: true, status: true } })).toEqual([
      { productId: vib.id, status: "PENDIENTE" },
    ]);
    expect(dispatch).not.toHaveBeenCalled(); // MdP: no hay dropship
    expect(await db.paymentEvent.count()).toBe(2);
  });

  it("markPaid despacha a SM y si SM falla queda PAID para el cron", async () => {
    const { vib } = await seed();
    const options = [
      { code: "moova-flex", label: "YIP", toAgency: false, price: 7_085, minDays: 1, maxDays: 2 },
    ];
    const o = await createOrder(
      db,
      mdp([[vib.id, 1]], {
        zone: { zone: "AMBA", cp: "1824" },
        shippingCode: "moova-flex",
        quote: { quoteId: "q", options },
        method: "MP",
      }),
    );
    const failing = vi.fn(async () => {
      throw new Error("SM caído");
    });
    const r = await markPaid(db, o.id, {
      event: { provider: "MP", externalId: "1", status: "approved" },
      dispatch: failing,
    });
    expect(r).toEqual({ status: "paid", dispatched: false, dispatchError: "SM caído" });

    const ok = vi.fn(async (id: string) => {
      await db.order.update({ where: { id }, data: { supplierOrderId: 1, status: "FULFILLING" } });
    });
    expect(await retryDispatch(db, ok)).toEqual({ retried: 1, ok: 1, failed: 0 });
    expect(await retryDispatch(db, ok)).toEqual({ retried: 0, ok: 0, failed: 0 });

    const o2 = await createOrder(
      db,
      mdp([[vib.id, 1]], {
        zone: { zone: "AMBA", cp: "1824" },
        shippingCode: "moova-flex",
        quote: { quoteId: "q", options },
      }),
    );
    await markPaid(db, o2.id, {
      event: { provider: "TRANSFER", externalId: "x", status: "verified" },
    });
    expect(await retryDispatch(db, failing)).toEqual({ retried: 1, ok: 0, failed: 1 });
    expect(
      await markPaid(db, o2.id, {
        event: { provider: "TRANSFER", externalId: "y", status: "verified" },
        dispatch: ok,
      }),
    ).toEqual({ status: "already-paid" });
  });

  it("vence la transferencia impaga y libera la reserva; un pago tardío queda para Eric", async () => {
    const { gel } = await seed();
    const o = await createOrder(db, mdp([[gel.id, 2]]));
    expect(await expireOrders(db, new Date(now.getTime() + 23 * 3_600_000))).toEqual({
      expired: 0,
    });
    expect(await expireOrders(db, new Date(now.getTime() + 25 * 3_600_000))).toEqual({
      expired: 1,
    });
    expect(await db.order.findUniqueOrThrow({ where: { id: o.id } })).toMatchObject({
      status: "CANCELLED",
    });
    expect(await level(gel.id)).toEqual({ quantity: 2, reserved: 0 });
    expect(await cancelOrder(db, o.id, "otra vez")).toEqual({ status: "noop" });

    const late = await markPaid(db, o.id, {
      event: { provider: "TRANSFER", externalId: "z", status: "verified" },
    });
    expect(late).toEqual({ status: "late" });
    expect((await db.order.findUniqueOrThrow({ where: { id: o.id } })).needsAttention).toBe(true);
  });

  // ── Webhook de MP ───────────────────────────────────

  function fakeMp(order: Record<string, unknown>): Pick<MpClient, "getOrder"> {
    return { getOrder: vi.fn(async () => mpOrderSchema.parse(order)) };
  }

  it("webhook: aprobado paga una vez; duplicado no hace nada; reembolso cancela y devuelve stock", async () => {
    const { gel } = await seed();
    const o = await createOrder(db, mdp([[gel.id, 1]], { method: "MP" }));
    const total = (await db.order.findUniqueOrThrow({ where: { id: o.id } })).total;
    const approved = {
      id: "ORD77",
      status: "processed",
      status_detail: "accredited",
      external_reference: o.id,
      total_paid_amount: `${total}.00`,
      currency: "ARS",
    };

    expect(await processMpOrder(db, fakeMp(approved), "ORD77")).toEqual({ result: "paid" });
    expect(await processMpOrder(db, fakeMp(approved), "ORD77")).toEqual({ result: "duplicate" });
    expect(await level(gel.id)).toEqual({ quantity: 1, reserved: 0 });

    const refunded = { ...approved, status: "refunded", status_detail: "refunded" };
    expect(await processMpOrder(db, fakeMp(refunded), "ORD77")).toEqual({ result: "cancelled" });
    expect(await processMpOrder(db, fakeMp(refunded), "ORD77")).toEqual({ result: "duplicate" });
    expect(await db.order.findUniqueOrThrow({ where: { id: o.id } })).toMatchObject({
      status: "CANCELLED",
    });
    expect(await level(gel.id)).toEqual({ quantity: 2, reserved: 0 });
    expect(
      (await db.stockMovement.findMany({ orderBy: { createdAt: "asc" } })).map((m) => m.type),
    ).toEqual(["SALE", "RETURN"]);
  });

  it("webhook: ticket pendiente extiende la reserva; rechazado y monto distinto no pagan", async () => {
    const { gel } = await seed();
    const o = await createOrder(db, mdp([[gel.id, 1]], { method: "MP" }));
    const before = (await db.order.findUniqueOrThrow({ where: { id: o.id } })).paymentDueAt!;
    const base = {
      id: "ORD1",
      external_reference: o.id,
      total_paid_amount: "1.00",
      currency: "ARS",
    };
    const ticket = { payments: [{ payment_method: { type: "ticket" } }] };

    expect(
      await processMpOrder(
        db,
        fakeMp({
          ...base,
          status: "action_required",
          created_date: now.toISOString(),
          transactions: ticket,
        }),
        "ORD1",
        { now },
      ),
    ).toEqual({ result: "waiting" });
    const after = (await db.order.findUniqueOrThrow({ where: { id: o.id } })).paymentDueAt!;
    expect(after.getTime()).toBeGreaterThan(before.getTime() + 48 * 3_600_000);

    expect(
      await processMpOrder(db, fakeMp({ ...base, id: "ORD2", status: "failed" }), "ORD2"),
    ).toEqual({
      result: "ignored",
    });
    expect(
      await processMpOrder(db, fakeMp({ ...base, id: "ORD3", status: "processed" }), "ORD3"),
    ).toEqual({
      result: "attention",
    });
    const row = await db.order.findUniqueOrThrow({ where: { id: o.id } });
    expect(row).toMatchObject({ status: "PENDING_PAYMENT", needsAttention: true });
    expect(row.attentionNote).toContain("monto pagado 1");
    expect(
      await processMpOrder(
        db,
        fakeMp({ ...base, id: "ORD4", external_reference: "otro", status: "processed" }),
        "ORD4",
      ),
    ).toEqual({
      result: "unknown-order",
    });
  });

  it("cancelar un pedido ya despachado a SM lo marca para Eric", async () => {
    const { vib } = await seed();
    const options = [
      { code: "moova-flex", label: "YIP", toAgency: false, price: 7_085, minDays: 1, maxDays: 2 },
    ];
    const o = await createOrder(
      db,
      mdp([[vib.id, 1]], {
        zone: { zone: "AMBA", cp: "1824" },
        shippingCode: "moova-flex",
        quote: { quoteId: "q", options },
      }),
    );
    await markPaid(db, o.id, {
      event: { provider: "TRANSFER", externalId: "1", status: "verified" },
    });
    await db.order.update({
      where: { id: o.id },
      data: { supplierOrderId: 99, status: "FULFILLING" },
    });
    expect(await cancelOrder(db, o.id, "reembolso")).toEqual({
      status: "cancelled",
      from: "FULFILLING",
    });
    const row = await db.order.findUniqueOrThrow({ where: { id: o.id } });
    expect(row.needsAttention).toBe(true);
    expect(row.attentionNote).toContain("avisar a SM (pedido 99)");
  });
});
