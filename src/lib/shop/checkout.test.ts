import { describe, expect, it } from "vitest";
import type { CatalogProduct } from "../catalog/queries";
import {
  buildCheckout,
  checkoutFormSchema,
  checkoutTotals,
  COURIER_CODE,
  deliveryGroups,
  needsQuote,
  shippingLabel,
  type QuotedOption,
} from "./checkout";
import { buildOrderView, formatDue, itemsCount, type OrderForView } from "./order-view";

const p = (
  id: string,
  price: number,
  local: number,
  sm: number,
  consumable = false,
): CatalogProduct => ({
  id,
  slug: id,
  name: id,
  description: null,
  price,
  category: "x",
  brand: null,
  images: [],
  silhouette: "sh-x",
  lowStock: false,
  availabilityInput: {
    isConsumable: consumable,
    localQuantity: local,
    offers: [{ supplier: "SM", mode: "DROPSHIP", stock: sm }],
  },
});

const gel = p("gel", 11_900, 5, 20, true);
const vib = p("vib", 42_500, 0, 8);
const succ = p("succ", 54_900, 1, 12);
const products = [gel, vib, succ];
const MDP = { zone: "MDP", cp: "7600" } as const;
const GBA = { zone: "AMBA", cp: "1824" } as const;
const INT = { zone: "INTERIOR", cp: "5000" } as const;
const cart = (lines: [string, number][], together = false) => ({
  lines: lines.map(([id, qty]) => ({ id, qty })),
  together,
});
const quoted: QuotedOption[] = [
  { code: "moova-flex", label: "YIP", toAgency: false, price: 7_085, minDays: 1, maxDays: 2 },
  { code: "ca-cp-suc", label: "Correo suc", toAgency: true, price: 8_270, minDays: 3, maxDays: 6 },
  {
    code: "ca-cp-dom",
    label: "Correo dom",
    toAgency: false,
    price: 13_303,
    minDays: 3,
    maxDays: 3,
  },
];

describe("checkout · MdP", () => {
  it("dos tandas: un cadete por tanda; la que llega a $ 15.000 va gratis", () => {
    const c = buildCheckout(
      cart([
        ["gel", 1],
        ["vib", 1],
      ]),
      products,
      MDP,
    );
    expect(c.twoBatches).toBe(true);
    expect(c.lines.map((l) => [l.productId, l.source])).toEqual([
      ["gel", "LOCAL"],
      ["vib", "ENCARGO"],
    ]);
    // gel 11.900 (hoy) paga cadete; vib 42.500 (después) va gratis.
    expect(c.choices).toEqual([
      expect.objectContaining({ code: COURIER_CODE, charged: 2_500, cost: 5_000 }),
    ]);
    expect(c.choices[0].detail).toContain("Dos entregas");
    expect(c.freeShipping).toBe(false);
    expect(needsQuote(c)).toBe(false);
    expect(deliveryGroups(c)).toEqual([
      { title: "Tanda 1 · Hoy", lines: ["gel × 1"] },
      { title: "Tanda 2 · Llega después", lines: ["vib × 1"] },
    ]);
  });

  it("todo junto: una sola entrega y un solo cadete", () => {
    const c = buildCheckout(
      cart(
        [
          ["gel", 1],
          ["vib", 1],
        ],
        true,
      ),
      products,
      MDP,
    );
    expect(c.choices[0]).toMatchObject({ charged: 0, cost: 2_500 });
    expect(c.choices[0].detail).toBe("Llega en 5 a 10 días. Gratis desde $ 15.000.");
    expect(deliveryGroups(c)[0].title).toBe("Todo junto");
  });

  it("solo stock local: llega hoy", () => {
    const c = buildCheckout(cart([["gel", 2]]), products, MDP);
    expect(c.choices[0]).toMatchObject({ charged: 0, detail: "Llega hoy. Gratis desde $ 15.000." });
    expect(c.freeShipping).toBe(true);
    expect(deliveryGroups(c)[0].title).toBe("Llega hoy");
  });

  it("solo lo que llega después", () => {
    const c = buildCheckout(cart([["vib", 1]]), products, MDP);
    expect(deliveryGroups(c)[0].title).toBe("Tu entrega");
  });

  it("carrito vacío o con productos despublicados: sin opciones", () => {
    const c = buildCheckout(cart([["nada", 1]]), products, MDP);
    expect(c.lines).toEqual([]);
    expect(c.choices).toEqual([]);
    expect(checkoutTotals(c, COURIER_CODE, "MP")).toBeNull();
  });
});

describe("checkout · AMBA e Interior", () => {
  it("GBA sobre el umbral: la más barata gratis, las demás pagan la diferencia", () => {
    const c = buildCheckout(cart([["vib", 1]]), products, GBA, quoted);
    expect(c.freeShipping).toBe(true); // 42.500 ≥ 40.000
    expect(c.choices.map((o) => [o.code, o.label, o.charged, o.cost])).toEqual([
      ["moova-flex", "Envío rápido a domicilio", 0, 7_085],
      ["ca-cp-suc", "Retiro en sucursal de Correo", 1_185, 8_270],
      ["ca-cp-dom", "Correo a domicilio", 6_218, 13_303],
    ]);
    expect(c.choices[1].detail).toBe("Retirás con tu DNI. 3 a 6 días hábiles.");
    expect(c.choices[2].detail).toBe("3 días hábiles.");
    expect(needsQuote(c)).toBe(true);
    expect(deliveryGroups(c)).toEqual([{ title: "Tu envío", lines: ["vib × 1"] }]);
  });

  it("consumibles no entran fuera de MdP y se avisan", () => {
    const c = buildCheckout(
      cart([
        ["gel", 1],
        ["vib", 1],
      ]),
      products,
      INT,
      quoted,
    );
    expect(c.lines.map((l) => l.productId)).toEqual(["vib"]);
    expect(c.leftOut).toEqual(["gel"]);
    expect(c.freeShipping).toBe(false); // Interior: sin envío gratis
    expect(c.choices[0].charged).toBe(7_085);
  });

  it("totales: transferencia con 10 % OFF solo sobre productos", () => {
    const c = buildCheckout(cart([["succ", 1]]), products, INT, quoted);
    expect(checkoutTotals(c, "ca-cp-dom", "TRANSFER")).toMatchObject({
      subtotal: 54_900,
      discount: 5_490,
      shippingCharged: 13_303,
      shippingCost: 13_303,
      total: 62_713,
    });
    expect(checkoutTotals(c, "ca-cp-dom", "MP")?.total).toBe(68_203);
    expect(checkoutTotals(c, "inexistente", "MP")).toBeNull();
  });

  it("nombres de envío por code", () => {
    expect(shippingLabel(COURIER_CODE)).toBe("Cadete en Mar del Plata");
    expect(shippingLabel("ca-ep-dom")).toBe("Correo Expreso a domicilio");
    expect(shippingLabel("otro")).toBe("Envío a domicilio");
    const c = buildCheckout(cart([["vib", 1]]), products, INT, [
      { code: "nuevo", label: "Algo nuevo", toAgency: false, price: 1, minDays: 1, maxDays: 1 },
    ]);
    expect(c.choices[0]).toMatchObject({ label: "Algo nuevo", detail: "1 día hábil." });
  });
});

describe("formulario de checkout", () => {
  const ok = {
    name: " Ana Pérez ",
    email: "ANA@Mail.com",
    phone: "223 555-1234",
    locality: "Mar del Plata",
    province: "Buenos Aires",
    street: "Colón",
    number: "1234",
  };
  it("normaliza y acepta lo mínimo", () => {
    expect(checkoutFormSchema.parse(ok)).toMatchObject({
      name: "Ana Pérez",
      email: "ana@mail.com",
    });
  });
  it("mensajes claros", () => {
    const r = checkoutFormSchema.safeParse({ ...ok, email: "x", phone: "12", street: " " });
    expect(r.success).toBe(false);
    const msgs = r.error!.issues.map((i) => i.message);
    expect(msgs).toEqual(expect.arrayContaining(["Revisá el email.", "Escribí la calle."]));
  });
});

// ── Página del pedido ─────────────────────────────────

const order = (over: Partial<OrderForView> = {}): OrderForView => ({
  code: "TS-7K3QX9",
  status: "PENDING_PAYMENT",
  paymentMethod: "TRANSFER",
  zone: "MDP",
  subtotal: 54_400,
  discount: 5_440,
  shippingCharged: 2_500,
  total: 51_460,
  paymentDueAt: new Date("2026-11-27T17:05:00Z"),
  paymentProofUrl: null,
  trackingCode: null,
  shippingCode: COURIER_CODE,
  deliverTogether: false,
  items: [
    { name: "Gel", quantity: 1, source: "LOCAL" },
    { name: "Vibrador", quantity: 1, source: "ENCARGO" },
  ],
  encargos: [],
  lastMpStatus: null,
  ...over,
});

/** formatMoney usa espacio duro: para comparar con texto plano. */
const plain = <T>(v: T): T => JSON.parse(JSON.stringify(v).replace(/\u00a0/g, " "));

describe("vista del pedido", () => {
  it("transferencia pendiente: monto, plazo, dos tandas y sin decir 'encargo'", () => {
    const v = plain(buildOrderView(order()));
    expect(v.title).toBe("Falta tu transferencia");
    expect(v.transfer).toEqual({
      amount: "$ 51.460",
      dueAt: "2026-11-27T17:05:00.000Z",
      proofSent: false,
    });
    expect(v.badge).toEqual({ cls: "b-plazo", text: "Pendiente de pago" });
    expect(v.groups.map((g) => g.title)).toEqual(["Tanda 1 · Hoy", "Tanda 2 · Llega después"]);
    expect(v.steps[0]).toMatchObject({ state: "now", note: "Esperamos tu pago para seguir." });
    expect(v.laterSteps).toBeNull(); // todavía no hay encargos (se crean al pagar)
    expect(v.delivery).toBe("Cadete en Mar del Plata");
    expect(v.totals).toEqual([
      { k: "Subtotal", v: "$ 54.400" },
      { k: "Transferencia 10% OFF", v: "− $ 5.440" },
      { k: "Envío", v: "$ 2.500" },
    ]);
    expect(JSON.stringify(v)).not.toMatch(/encargo/i);
  });

  it("comprobante ya enviado", () => {
    expect(buildOrderView(order({ paymentProofUrl: "x" })).transfer?.proofSent).toBe(true);
  });

  it("MP: esperando, ticket de efectivo y rechazado", () => {
    const mp = (s: string | null) =>
      buildOrderView(order({ paymentMethod: "MP", discount: 0, lastMpStatus: s }));
    expect(mp(null)).toMatchObject({
      mp: "waiting",
      title: "Estamos esperando tu pago",
      transfer: null,
    });
    expect(mp("pending").mp).toBe("ticket");
    expect(mp("in_process").lead).toContain("Rapipago");
    expect(mp("rejected")).toMatchObject({ mp: "rejected", title: "El pago no se aprobó" });
    expect(mp("cancelled").mp).toBe("rejected");
  });

  it("pagado con lo que llega después: dos líneas de tiempo", () => {
    const v = buildOrderView(
      order({
        status: "PAID",
        encargos: [{ status: "PEDIDO_A_PROVEEDOR" }, { status: "CANCELADO" }],
        shippingCharged: 0,
        discount: 0,
      }),
    );
    expect(v.title).toBe("¡Listo, recibimos tu pedido!");
    expect(v.badge).toEqual({ cls: "b-hoy", text: "Pagado" });
    expect(v.steps.map((s) => s.state)).toEqual(["done", "now", "todo", "todo", "todo"]);
    expect(v.laterSteps?.map((s) => [s.label, s.state])).toEqual([
      ["Confirmado", "done"],
      ["En camino a Mar del Plata", "now"],
      ["Listo para entregar", "todo"],
      ["Entregado", "todo"],
    ]);
    expect(plain(v.totals.at(-1))).toEqual({ k: "Envío", v: "Gratis" });
    expect(v.mp).toBeNull();
  });

  it("enviado con tracking, entregado y todo junto", () => {
    const shipped = buildOrderView(
      order({
        status: "SHIPPED",
        zone: "AMBA",
        trackingCode: "123",
        shippingCode: "moova-flex",
        items: [{ name: "Vib", quantity: 2, source: "DROPSHIP" }],
      }),
    );
    expect(shipped).toMatchObject({
      title: "Tu pedido está en marcha",
      trackingCode: "123",
      delivery: "Envío rápido a domicilio",
    });
    expect(shipped.groups).toEqual([{ title: "Tu envío", lines: ["Vib × 2"] }]);
    const done = buildOrderView(
      order({ status: "DELIVERED", deliverTogether: true, shippingCode: null }),
    );
    expect(done).toMatchObject({
      title: "Tu pedido llegó",
      badge: { cls: "b-ok", text: "Entregado" },
      delivery: "",
    });
    expect(done.groups.map((g) => g.title)).toEqual(["Tu entrega"]);
    const today = buildOrderView(
      order({ status: "FULFILLING", items: [{ name: "Gel", quantity: 1, source: "LOCAL" }] }),
    );
    expect(today.groups[0].title).toBe("Llega hoy");
  });

  it("cancelado", () => {
    const v = buildOrderView(order({ status: "CANCELLED" }));
    expect(v).toMatchObject({
      cancelled: true,
      title: "Pedido cancelado",
      steps: [],
      laterSteps: null,
      transfer: null,
    });
    expect(v.badge.cls).toBe("b-no");
  });

  it("transferencia pendiente sin vencimiento no muestra el bloque", () => {
    expect(buildOrderView(order({ paymentDueAt: null })).transfer).toBeNull();
  });

  it("formatos", () => {
    expect(formatDue("2026-11-27T17:05:00Z")).toMatch(/27 de noviembre.*14:05/);
    expect(itemsCount(order())).toBe("2 productos");
  });
});
