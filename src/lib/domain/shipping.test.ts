import { describe, expect, it } from "vitest";
import type { CartPlan } from "./cart";
import { courierCharge, quotedShippingChoices } from "./shipping";

const price = (id: string) => ({ a: 10_000, b: 6_000, c: 20_000 })[id] ?? 0;

const plan = (batches: CartPlan["batches"]): CartPlan => ({
  items: batches.flatMap((b) => b.items),
  batches,
  unavailable: [],
});

describe("courierCharge (cadete MdP)", () => {
  it("una tanda bajo el umbral paga un cadete", () => {
    const r = courierCharge(
      plan([
        {
          key: "TODAY",
          delivery: "hoy",
          items: [{ productId: "a", quantity: 1, source: "LOCAL" }],
        },
      ]),
      price,
      { fee: 2_500, threshold: 15_000 },
    );
    expect(r).toEqual({
      charged: 2_500,
      cost: 2_500,
      batches: [{ key: "TODAY", base: 10_000, charged: 2_500 }],
    });
  });

  it("cada tanda se mide aparte: la que llega al umbral va gratis", () => {
    const r = courierCharge(
      plan([
        {
          key: "TODAY",
          delivery: "hoy",
          items: [{ productId: "c", quantity: 1, source: "LOCAL" }],
        },
        {
          key: "LATER",
          delivery: "5 a 10",
          items: [{ productId: "b", quantity: 1, source: "ENCARGO" }],
        },
      ]),
      price,
      { fee: 2_500, threshold: 15_000 },
    );
    expect(r.batches).toEqual([
      { key: "TODAY", base: 20_000, charged: 0 },
      { key: "LATER", base: 6_000, charged: 2_500 },
    ]);
    expect(r).toMatchObject({ charged: 2_500, cost: 5_000 });
  });

  it("justo en el umbral es gratis; usa config por defecto", () => {
    const r = courierCharge(
      plan([
        {
          key: "TODAY",
          delivery: "hoy",
          items: [{ productId: "b", quantity: 3, source: "LOCAL" }],
        },
      ]),
      price,
    );
    expect(r.charged).toBe(0); // 18.000 ≥ 15.000
  });

  it("sin tandas no hay cadete", () => {
    expect(courierCharge(plan([]), price)).toEqual({ charged: 0, cost: 0, batches: [] });
  });
});

describe("quotedShippingChoices (SM)", () => {
  const opts = [
    { code: "ca-cp-dom", price: 13_303 },
    { code: "moova-flex", price: 7_085 },
    { code: "ca-cp-suc", price: 8_270 },
  ];

  it("sin envío gratis cada opción cuesta lo cotizado", () => {
    expect(quotedShippingChoices(opts, false)).toEqual([
      { code: "ca-cp-dom", price: 13_303, charged: 13_303, cost: 13_303 },
      { code: "moova-flex", price: 7_085, charged: 7_085, cost: 7_085 },
      { code: "ca-cp-suc", price: 8_270, charged: 8_270, cost: 8_270 },
    ]);
  });

  it("con envío gratis la más barata va en 0 y las demás pagan la diferencia", () => {
    expect(quotedShippingChoices(opts, true).map((o) => [o.code, o.charged, o.cost])).toEqual([
      ["ca-cp-dom", 6_218, 13_303],
      ["moova-flex", 0, 7_085],
      ["ca-cp-suc", 1_185, 8_270],
    ]);
  });

  it("sin opciones devuelve vacío", () => {
    expect(quotedShippingChoices([], true)).toEqual([]);
  });
});
