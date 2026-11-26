import { describe, expect, it } from "vitest";
import type { CatalogProduct } from "../catalog/queries";
import { formatMoney, pluralize } from "./format";
import {
  EMPTY_CART,
  MAX_CART_LINES,
  MAX_LINE_QTY,
  cartUnits,
  changeQty,
  normalizeCp,
  parseCart,
  parseZone,
  serializeCart,
  serializeZone,
  setQty,
  zoneFromCp,
  zoneLabel,
} from "./session";
import { deliveryNote, filterCatalog, priceView, productBadge, shippingCopy } from "./view";

const product = (
  p: Partial<CatalogProduct> & { local?: number; sm?: number; consumable?: boolean } = {},
): CatalogProduct => ({
  id: p.id ?? "p1",
  slug: "p",
  name: "Producto",
  description: null,
  price: p.price ?? 54_900,
  category: "succionadores",
  brand: null,
  images: [],
  silhouette: "sh-glow",
  lowStock: false,
  availabilityInput: {
    isConsumable: p.consumable ?? false,
    localQuantity: p.local ?? 0,
    offers: [{ supplier: "SM", mode: "DROPSHIP", stock: p.sm ?? 0 }],
  },
});

const MDP = { zone: "MDP", cp: "7600" } as const;
const CABA = { zone: "AMBA", cp: "1425" } as const;
const GBA = { zone: "AMBA", cp: "1640" } as const;
const INT = { zone: "INTERIOR", cp: "5000" } as const;

describe("formato", () => {
  it("pesos con punto de miles", () => {
    expect(formatMoney(54_900)).toBe("$\u00a054.900");
    expect(formatMoney(1_234_567)).toBe("$\u00a01.234.567");
    expect(formatMoney(900)).toBe("$\u00a0900");
    expect(formatMoney(-5_490)).toBe("− $\u00a05.490");
  });
  it("plural", () => {
    expect(pluralize(1, "producto", "productos")).toBe("1 producto");
    expect(pluralize(3, "producto", "productos")).toBe("3 productos");
  });
});

describe("cookie de zona", () => {
  it("normaliza el CP", () => {
    expect(normalizeCp(" 7600 ")).toBe("7600");
    expect(normalizeCp("B7600")).toBe("7600");
    expect(normalizeCp("C1425ABC")).toBe("1425");
    expect(normalizeCp("76")).toBeNull();
    expect(normalizeCp("0999")).toBeNull();
    expect(normalizeCp("hola")).toBeNull();
  });
  it("zona por CP (sin cotización: GBA cae en Interior hasta la Fase 3)", () => {
    expect(zoneFromCp("7600")).toEqual(MDP);
    expect(zoneFromCp("1425")).toEqual(CABA);
    expect(zoneFromCp("1640").zone).toBe("INTERIOR");
  });
  it("ida y vuelta, y descarta basura", () => {
    expect(parseZone(serializeZone(MDP))).toEqual(MDP);
    expect(parseZone(undefined)).toBeNull();
    expect(parseZone("MARTE:7600")).toBeNull();
    expect(parseZone("MDP:76")).toBeNull();
  });
  it("etiqueta", () => {
    expect([MDP, CABA, GBA, INT].map(zoneLabel)).toEqual([
      "Mar del Plata",
      "CABA",
      "GBA",
      "Interior",
    ]);
  });
});

describe("cookie de carrito", () => {
  it("ida y vuelta", () => {
    const c = { lines: [{ id: "a", qty: 2 }], together: true };
    expect(parseCart(serializeCart(c))).toEqual(c);
  });
  it("cookie vacía, rota o fuera de rango → carrito vacío", () => {
    expect(parseCart(undefined)).toEqual(EMPTY_CART);
    expect(parseCart("{no es json")).toEqual(EMPTY_CART);
    expect(parseCart(JSON.stringify({ l: [["a", 0]], j: 0 }))).toEqual(EMPTY_CART);
    expect(parseCart(JSON.stringify({ l: [["a", MAX_LINE_QTY + 1]], j: 0 }))).toEqual(EMPTY_CART);
  });
  it("sumar, restar, fijar y quitar", () => {
    let c = changeQty(EMPTY_CART, "a", 1);
    c = changeQty(c, "a", 2);
    c = changeQty(c, "b", 1);
    expect(c.lines).toEqual([
      { id: "a", qty: 3 },
      { id: "b", qty: 1 },
    ]);
    expect(cartUnits(c)).toBe(4);
    c = changeQty(c, "a", -3);
    expect(c.lines).toEqual([{ id: "b", qty: 1 }]);
    expect(setQty(c, "b", 99).lines).toEqual([{ id: "b", qty: MAX_LINE_QTY }]);
    expect(setQty(c, "b", 0).lines).toEqual([]);
  });
  it("cambiar una línea no toca las demás; 'todo junto' apagado también se guarda", () => {
    const c = {
      lines: [
        { id: "a", qty: 1 },
        { id: "b", qty: 1 },
      ],
      together: false,
    };
    expect(setQty(c, "b", 3).lines).toEqual([
      { id: "a", qty: 1 },
      { id: "b", qty: 3 },
    ]);
    expect(parseCart(serializeCart(c))).toEqual(c);
  });
  it("respeta el tope de líneas", () => {
    const full = {
      lines: Array.from({ length: MAX_CART_LINES }, (_, i) => ({ id: `p${i}`, qty: 1 })),
      together: false,
    };
    expect(changeQty(full, "otro", 1)).toBe(full);
  });
});

describe("badges (salen de availability)", () => {
  it("sin zona → pide CP y muestra precio", () => {
    expect(productBadge(product(), null)).toEqual({
      kind: "zona",
      text: "Elegí tu zona",
      available: true,
    });
  });
  it("MdP: local resaltado, sin stock local → plazo normal", () => {
    expect(productBadge(product({ local: 1 }), MDP)).toMatchObject({
      kind: "hoy",
      text: "Hoy en Mar del Plata",
    });
    expect(productBadge(product({ sm: 3 }), MDP)).toMatchObject({
      kind: "plazo",
      text: "Llega en 5 a 10 días",
    });
  });
  it("AMBA e Interior por dropship; consumibles no", () => {
    expect(productBadge(product({ sm: 3 }), CABA)).toMatchObject({
      kind: "envio",
      text: "Llega en 48 h",
    });
    expect(productBadge(product({ sm: 3 }), INT)).toMatchObject({
      kind: "envio",
      text: "Envío 3 a 6 días",
    });
    expect(productBadge(product({ sm: 3, local: 4, consumable: true }), CABA)).toEqual({
      kind: "no",
      text: "No disponible en tu zona",
      available: false,
    });
  });
});

describe("precio", () => {
  it("lista y transferencia (10 % OFF)", () => {
    expect(priceView(54_900)).toEqual({ list: "$\u00a054.900", transfer: "$\u00a049.410" });
  });
});

describe("filtros del catálogo", () => {
  const items = [
    product({ id: "barato-local", price: 11_900, local: 2 }),
    product({ id: "medio-sm", price: 29_900, sm: 4 }),
    product({ id: "caro-local", price: 54_900, local: 1 }),
  ];
  const ids = (ps: CatalogProduct[]) => ps.map((p) => p.id);

  it("por precio (rango semiabierto)", () => {
    expect(ids(filterCatalog(items, { today: false, price: "hasta-20000" }, null))).toEqual([
      "barato-local",
    ]);
    expect(ids(filterCatalog(items, { today: false, price: "20000-40000" }, null))).toEqual([
      "medio-sm",
    ]);
    expect(ids(filterCatalog(items, { today: false, price: "mas-de-40000" }, null))).toEqual([
      "caro-local",
    ]);
  });
  it("'entrega hoy' solo en MdP", () => {
    expect(ids(filterCatalog(items, { today: true }, MDP))).toEqual(["barato-local", "caro-local"]);
    expect(filterCatalog(items, { today: true }, CABA)).toHaveLength(3);
    expect(filterCatalog(items, { today: false }, MDP)).toHaveLength(3);
  });
});

describe("textos de envío", () => {
  it("montos desde config según zona", () => {
    expect(shippingCopy(null).title).toBe("envío gratis según tu zona");
    expect(shippingCopy(MDP).title).toBe("gratis desde $\u00a015.000");
    expect(shippingCopy(CABA).title).toBe("gratis desde $\u00a030.000");
    expect(shippingCopy(GBA).title).toBe("gratis desde $\u00a040.000");
    expect(shippingCopy(INT).title).toBe("envíos a todo el país");
  });
  it("caja de envío de la ficha", () => {
    const note = (p: CatalogProduct, z: Parameters<typeof productBadge>[1]) =>
      deliveryNote(productBadge(p, z), z).title;
    expect(note(product(), null)).toBe("Elegí tu zona para ver el envío");
    expect(note(product({ consumable: true, local: 3 }), INT)).toBe("No disponible en tu zona");
    expect(note(product({ local: 1 }), MDP)).toBe("Lo recibís hoy con cadete");
    expect(note(product({ sm: 2 }), MDP)).toBe("Llega en 5 a 10 días");
    expect(note(product({ sm: 2 }), CABA)).toBe("Llega en 48 h");
    expect(note(product({ sm: 2 }), INT)).toBe("Envío 3 a 6 días");
  });
  it("nunca dice 'encargo' ni 'recargo' de cara al cliente", () => {
    const all = [null, MDP, CABA, GBA, INT].flatMap((z) => [
      ...Object.values(shippingCopy(z)),
      ...[product({ local: 1 }), product({ sm: 1 }), product()].flatMap((p) =>
        Object.values(deliveryNote(productBadge(p, z), z)),
      ),
    ]);
    expect(all.join(" ")).not.toMatch(/encargo|recargo|inter[eé]s/i);
  });
});
