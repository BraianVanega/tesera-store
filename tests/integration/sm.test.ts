/**
 * Integración de SM contra Postgres real (base de pruebas aparte, se vacía en cada test).
 * Corre solo con TEST_DATABASE_URL; en CI (sin base) se saltea.
 *
 *   TEST_DATABASE_URL=postgresql://tesera@127.0.0.1:54329/tesera_test pnpm test
 */
import { readFileSync } from "node:fs";
import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { listPublished } from "../../src/lib/catalog/queries";
import { createPrisma } from "../../src/lib/prisma";
import type { SmClient, SmLogEntry } from "../../src/lib/sm/client";
import { dispatchOrder } from "../../src/lib/sm/dispatch";
import { smProductsDataSchema, smStockDataSchema, type SmProduct } from "../../src/lib/sm/schemas";
import { pollOrderStatuses } from "../../src/lib/sm/status";
import { PRODUCTS_CURSOR, syncProducts, syncStock } from "../../src/lib/sm/sync";

const url = process.env.TEST_DATABASE_URL;
const fixture = (name: string) =>
  JSON.parse(readFileSync(new URL(`../fixtures/sm/${name}.json`, import.meta.url), "utf8")).data;
const productsPage = smProductsDataSchema.parse(fixture("products"));

describe.skipIf(!url)("SM ↔ base (integración)", () => {
  let db: PrismaClient;
  const logs: SmLogEntry[] = [];
  const log = (e: SmLogEntry) => {
    logs.push(e);
  };

  beforeAll(() => {
    db = createPrisma(url!);
  });
  afterAll(async () => {
    await db.$disconnect();
  });
  beforeEach(async () => {
    logs.length = 0;
    await db.$executeRawUnsafe(
      'TRUNCATE "Order", "OrderItem", "Product", "SupplierOffer", "ProductImage", "LocalStock", "SyncState", "IntegrationLog" CASCADE',
    );
  });

  /** Cliente falso: una sola página de productos. */
  function fakeClient(items: SmProduct[] = productsPage.items) {
    const page = { ...productsPage, items, totalPaginas: 1 };
    return {
      productsPage: vi.fn(async () => page),
      modifiedPage: vi.fn(async () => page),
      stockPage: vi.fn(async () => smStockDataSchema.parse(fixture("stock"))),
    };
  }

  it("el sync completo es idempotente y no pisa lo curado", async () => {
    const client = fakeClient();
    const first = await syncProducts({ db, client, log }, "full");
    expect(first).toMatchObject({ mode: "full", seen: 2, created: 2, complete: true });
    expect(await db.supplierOffer.count()).toBe(4); // DROPSHIP + STOCK por SKU

    // Brai cura un producto: nombre, precio, publicado.
    const offer = await db.supplierOffer.findFirstOrThrow({ where: { supplierSku: "ABC123" } });
    await db.product.update({
      where: { id: offer.productId },
      data: { name: "Curado", price: 30_000, published: true, category: "vibradores" },
    });

    const second = await syncProducts({ db, client, log }, "full");
    expect(second).toMatchObject({ created: 0, updated: 2 });
    expect(await db.product.count()).toBe(2);
    expect(await db.supplierOffer.count()).toBe(4);
    const curated = await db.product.findUniqueOrThrow({ where: { id: offer.productId } });
    expect(curated).toMatchObject({ name: "Curado", price: 30_000, published: true });

    // Guardó el cursor para el incremental.
    expect((await db.syncState.findUnique({ where: { key: PRODUCTS_CURSOR } }))?.value).toBe(
      "2026-06-25T16:35:10",
    );
    expect(await db.integrationLog.count()).toBe(0); // el logger es el falso
    expect(logs.map((l) => [l.action, l.ok])).toEqual([
      ["sync.products.full", true],
      ["sync.products.full", true],
    ]);
  });

  it("incremental: sin cursor hace el completo; con cursor usa /modificados", async () => {
    const client = fakeClient();
    expect((await syncProducts({ db, client, log }, "incremental")).mode).toBe("full");
    expect((await syncProducts({ db, client, log }, "incremental")).mode).toBe("incremental");
    expect(client.modifiedPage).toHaveBeenCalledWith("2026-06-25T16:35:10", 1);
  });

  it("si SM falla a mitad: no borra nada y el cursor no avanza", async () => {
    const client = fakeClient();
    await syncProducts({ db, client, log }, "full");
    await db.syncState.update({
      where: { key: PRODUCTS_CURSOR },
      data: { value: "2026-01-01T00:00:00" },
    });

    client.modifiedPage.mockRejectedValueOnce(new Error("SM caído"));
    const r = await syncProducts({ db, client, log }, "incremental");
    expect(r).toMatchObject({ complete: false, error: "SM caído" });
    expect(await db.supplierOffer.count()).toBe(4);
    expect((await db.syncState.findUnique({ where: { key: PRODUCTS_CURSOR } }))?.value).toBe(
      "2026-01-01T00:00:00",
    );
    expect(logs.at(-1)).toMatchObject({ ok: false, action: "sync.products.incremental" });
  });

  it("stock: actualiza los SKUs conocidos e ignora el resto", async () => {
    const client = fakeClient();
    await syncProducts({ db, client, log }, "full");
    const later = new Date(Date.now() + 60_000);
    const r = await syncStock({ db, client, log, now: later });
    expect(r).toMatchObject({ seen: 3, updated: 1, unknown: 2, complete: true });
    const offers = await db.supplierOffer.findMany({ where: { supplierSku: "ABC123" } });
    expect(offers.every((o) => o.stock === 12 && o.syncedAt.getTime() === later.getTime())).toBe(
      true,
    );
  });

  it("stock: error de SM no borra y queda registrado", async () => {
    const client = fakeClient();
    client.stockPage.mockRejectedValueOnce(new Error("timeout"));
    const r = await syncStock({ db, client, log });
    expect(r).toMatchObject({ complete: false, error: "timeout" });
    expect(logs.at(-1)).toMatchObject({ action: "sync.stock", ok: false });
  });

  it("oferta vieja (sync caído) deja el producto sin stock en la tienda", async () => {
    const client = fakeClient();
    await syncProducts({ db, client, log, now: new Date(Date.now() - 7 * 3_600_000) }, "full");
    await db.product.updateMany({ data: { published: true, category: "vibradores" } });
    const [p] = (await listPublished(db)).filter((x) => x.availabilityInput.offers.length);
    expect(p.availabilityInput.offers.every((o) => o.stock === 0)).toBe(true);
  });

  // ── Despacho y seguimiento ──────────────────────────────────────────

  async function paidOrder(over: Record<string, unknown> = {}) {
    await syncProducts({ db, client: fakeClient(), log }, "full");
    const offer = await db.supplierOffer.findFirstOrThrow({
      where: { supplierSku: "ABC123", mode: "DROPSHIP" },
    });
    return db.order.create({
      data: {
        code: "TS-7K3QX9",
        trackingToken: "tok",
        paymentMethod: "MP",
        status: "PAID",
        zone: "AMBA",
        subtotal: 49_980,
        total: 49_980,
        customerName: "Ana Pérez",
        customerPhone: "2235551234",
        customerEmail: "ana@example.com",
        street: "Av. Siempre Viva",
        streetNumber: "742",
        locality: "Lanus",
        postalCode: "1824",
        provinceId: 4,
        province: "Buenos Aires",
        shippingCode: "ca-cp-dom",
        quoteId: "q_123",
        items: {
          create: [
            { productId: offer.productId, quantity: 2, unitPrice: 24_990, source: "DROPSHIP" },
          ],
        },
        ...over,
      },
    });
  }

  const created = fixture("order-created");
  const existing = fixture("order-existing");

  it("despacha una vez, sin email; reintentar no duplica", async () => {
    const o = await paidOrder();
    const createOrder = vi
      .fn<SmClient["createOrder"]>()
      .mockResolvedValueOnce(created)
      .mockResolvedValueOnce(existing);

    const r = await dispatchOrder(db, { createOrder }, o.id);
    expect(r).toMatchObject({
      status: "dispatched",
      supplierOrderId: 123456,
      alreadyExisted: false,
    });
    const body = createOrder.mock.calls[0][0];
    expect(body.externalOrderId).toBe("TS-7K3QX9");
    expect(body.items).toEqual([{ sku: "ABC123", cantidad: 2 }]);
    expect(JSON.stringify(body)).not.toContain("ana@example.com");

    const after = await db.order.findUniqueOrThrow({ where: { id: o.id } });
    expect(after).toMatchObject({
      status: "FULFILLING",
      supplierOrderId: 123456,
      needsAttention: true, // SM avisó falta de stock
    });
    expect(after.attentionNote).toContain("pediste 2 y hay 1");
    expect(after.dispatchedAt).not.toBeNull();

    // Ya despachado: no vuelve a llamar.
    expect(await dispatchOrder(db, { createOrder }, o.id)).toEqual({
      status: "skipped",
      reason: "already-dispatched",
    });
    // Si se cortó antes de guardar (timeout), el reintento recibe yaExistia.
    await db.order.update({ where: { id: o.id }, data: { supplierOrderId: null } });
    expect(await dispatchOrder(db, { createOrder }, o.id)).toMatchObject({
      status: "dispatched",
      alreadyExisted: true,
    });
    expect(createOrder).toHaveBeenCalledTimes(2);
  });

  it("no despacha sin pago, sin líneas dropship o sin datos", async () => {
    const createOrder = vi.fn<SmClient["createOrder"]>();
    const pending = await paidOrder({ status: "PENDING_PAYMENT" });
    expect(await dispatchOrder(db, { createOrder }, pending.id)).toEqual({
      status: "skipped",
      reason: "not-paid",
    });
    await db.order.update({ where: { id: pending.id }, data: { status: "PAID", quoteId: null } });
    expect(await dispatchOrder(db, { createOrder }, pending.id)).toEqual({
      status: "needs-data",
      missing: ["quoteId"],
    });
    expect((await db.order.findUniqueOrThrow({ where: { id: pending.id } })).needsAttention).toBe(
      true,
    );

    await db.orderItem.updateMany({ data: { source: "LOCAL" } });
    expect(await dispatchOrder(db, { createOrder }, pending.id)).toEqual({
      status: "skipped",
      reason: "no-dropship",
    });
    expect(createOrder).not.toHaveBeenCalled();
  });

  it("producto dropship sin SKU de SM → needs-data", async () => {
    const o = await paidOrder();
    await db.supplierOffer.deleteMany({ where: { mode: "DROPSHIP" } });
    expect(await dispatchOrder(db, { createOrder: vi.fn() }, o.id)).toEqual({
      status: "needs-data",
      missing: ["sku de SM"],
    });
  });

  it("si SM falla el pedido sigue PAID para reintentar", async () => {
    const o = await paidOrder();
    const createOrder = vi.fn<SmClient["createOrder"]>().mockRejectedValue(new Error("409"));
    await expect(dispatchOrder(db, { createOrder }, o.id)).rejects.toThrow("409");
    expect((await db.order.findUniqueOrThrow({ where: { id: o.id } })).status).toBe("PAID");
  });

  it("el seguimiento guarda el estado crudo y pasa a SHIPPED con tracking", async () => {
    const o = await paidOrder({ status: "FULFILLING", supplierOrderId: 123456, code: "TS-1" });
    await db.order.create({
      data: {
        code: "TS-2",
        trackingToken: "tok2",
        paymentMethod: "MP",
        status: "FULFILLING",
        zone: "INTERIOR",
        subtotal: 1,
        total: 1,
        postalCode: "5000",
        supplierOrderId: 2,
      },
    });
    await db.order.create({
      data: {
        code: "TS-3",
        trackingToken: "tok3",
        paymentMethod: "MP",
        status: "FULFILLING",
        zone: "INTERIOR",
        subtotal: 1,
        total: 1,
        postalCode: "5000",
        supplierOrderId: 3,
      },
    });
    const orderStatus = vi.fn<SmClient["orderStatus"]>(async (code) => {
      if (code === "TS-1") return fixture("order-status");
      if (code === "TS-2") return null;
      throw new Error("timeout");
    });
    const r = await pollOrderStatuses(db, { orderStatus }, log);
    expect(r).toEqual({ checked: 3, updated: 1, shipped: 1, failed: 2 });
    expect(await db.order.findUniqueOrThrow({ where: { id: o.id } })).toMatchObject({
      status: "SHIPPED",
      supplierStatus: "despachado",
      trackingCode: "1234567890",
    });
    expect(logs.filter((l) => l.action === "orders.status")).toEqual([
      {
        action: "orders.status",
        ok: true,
        orderCode: "TS-1",
        message: "fulfillmentStatus=despachado",
      },
      { action: "orders.status", ok: false, httpStatus: 404, orderCode: "TS-2" },
    ]);
  });

  it("el seguimiento corta cuando no hay cupo", async () => {
    await paidOrder({ status: "FULFILLING", supplierOrderId: 1 });
    const budget = Object.assign(new Error("Cupo"), { code: "budget" });
    const orderStatus = vi.fn<SmClient["orderStatus"]>().mockRejectedValue(budget);
    expect(await pollOrderStatuses(db, { orderStatus }, log)).toMatchObject({
      checked: 1,
      failed: 1,
    });
  });
});
