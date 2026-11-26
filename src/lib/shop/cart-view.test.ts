import { describe, expect, it } from "vitest";
import type { CatalogProduct } from "../catalog/queries";
import { buildCartView } from "./cart-view";
import { MAX_LINE_QTY } from "./session";

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
const CABA = { zone: "AMBA", cp: "1425" } as const;
const INT = { zone: "INTERIOR", cp: "5000" } as const;
const cart = (lines: [string, number][], together = false) => ({
  lines: lines.map(([id, qty]) => ({ id, qty })),
  together,
});
const nbsp = (s: string) => s.replace(/\$ /g, "$ ");

describe("vista del carrito", () => {
  it("MdP mixto: dos tandas, barra sobre lo de hoy, sin decir 'encargo'", () => {
    const v = buildCartView(
      cart([
        ["gel", 1],
        ["vib", 1],
      ]),
      products,
      MDP,
    );
    expect(v.batches.map((b) => b.title)).toEqual(["Tanda 1 · Hoy", "Tanda 2 · Llega después"]);
    expect(v.batches[0]!.badge).toEqual({ kind: "hoy", text: "Entrega hoy con cadete" });
    expect(v.canDeliverTogether).toBe(true);
    expect(v.freeShipping).toMatchObject({ kind: "bar", base: 11_900, threshold: 15_000, pct: 79 });
    expect(v.freeShipping.text).toBe(
      nbsp("Te faltan $ 3.100 para el envío gratis para la entrega de hoy"),
    );
    expect(v.subtotal).toBe(nbsp("$ 54.400"));
    expect(v.discount).toBe(nbsp("$ 5.440"));
    expect(v.totalTransfer).toBe(nbsp("$ 48.960"));
    expect(v.units).toBe(2);
    expect(JSON.stringify(v)).not.toMatch(/encargo/i);
  });

  it("MdP todo junto: una sola entrega y la barra mide todo", () => {
    const v = buildCartView(
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
    expect(v.batches).toHaveLength(1);
    expect(v.batches[0]!.title).toBe("Todo junto");
    expect(v.batches[0]!.note).toMatch(/una sola entrega/);
    expect(v.freeShipping).toMatchObject({ kind: "bar", pct: 100 });
    expect(v.freeShipping.text).toBe("¡Listo! Tu pedido tiene envío gratis");
  });

  it("MdP: una línea partida lleva el stepper solo en la primera tanda", () => {
    const v = buildCartView(cart([["succ", 3]]), products, MDP);
    expect(
      v.batches.map((b) => b.items.map((i) => [i.quantity, i.showStepper, i.lineQty])),
    ).toEqual([[[1, true, 3]], [[2, false, 3]]]);
  });

  it("MdP: solo local → 'Llega hoy'; solo SM → 'Tu entrega'", () => {
    expect(buildCartView(cart([["gel", 1]]), products, MDP).batches[0]!.title).toBe("Llega hoy");
    const later = buildCartView(cart([["vib", 1]]), products, MDP).batches[0]!;
    expect(later.title).toBe("Tu entrega");
    expect(later.note).not.toMatch(/una sola entrega/);
  });

  it("CABA: dropship, consumible no disponible, umbral CABA", () => {
    const v = buildCartView(
      cart([
        ["gel", 2],
        ["vib", 1],
      ]),
      products,
      CABA,
    );
    expect(v.batches).toHaveLength(1);
    expect(v.batches[0]).toMatchObject({
      title: "Tu envío",
      badge: { kind: "envio", text: "Llega en 48 h" },
    });
    expect(v.unavailable).toEqual([{ product: gel, quantity: 2, partial: false }]);
    expect(v.freeShipping).toMatchObject({ kind: "bar", threshold: 30_000, pct: 100 });
    expect(v.subtotal).toBe(nbsp("$ 42.500"));
  });

  it("Interior: sin envío gratis", () => {
    const v = buildCartView(cart([["vib", 1]]), products, INT);
    expect(v.freeShipping).toEqual({
      kind: "none",
      text: "Al interior pagás el costo cotizado del envío. Lo ves antes de pagar.",
    });
  });

  it("más unidades que stock → parcial no disponible; tope de cantidad", () => {
    const v = buildCartView(cart([["vib", MAX_LINE_QTY]]), products, MDP);
    expect(v.unavailable).toEqual([{ product: vib, quantity: MAX_LINE_QTY - 8, partial: true }]);
    expect(v.batches[0]!.items[0]!.canAdd).toBe(false);
  });

  it("descarta productos que ya no están publicados; vacío no se puede pagar", () => {
    const v = buildCartView(cart([["borrado", 1]]), products, MDP);
    expect(v.units).toBe(0);
    expect(v.batches).toEqual([]);
    expect(v.canCheckout).toBe(false);
  });
});
