import { describe, expect, it } from "vitest";
import type { ProductLike } from "./availability";
import { freeShippingBase, isMixedCart, planCart } from "./cart";

const prod = (p: Partial<ProductLike> = {}): ProductLike => ({
  isConsumable: false,
  localQuantity: 0,
  offers: [{ supplier: "SM", mode: "DROPSHIP", stock: 10 }],
  ...p,
});

describe("carrito en MdP", () => {
  it("todo local → una sola tanda 'Hoy'", () => {
    const plan = planCart(
      [{ productId: "a", quantity: 1, product: prod({ localQuantity: 2 }) }],
      "MDP",
    );
    expect(plan.batches).toEqual([
      {
        key: "TODAY",
        delivery: "Hoy en Mar del Plata",
        items: [{ productId: "a", quantity: 1, source: "LOCAL" }],
      },
    ]);
    expect(isMixedCart(plan)).toBe(false);
  });

  it("todo sin stock local → una tanda 'Llega en 5 a 10 días'", () => {
    const plan = planCart([{ productId: "a", quantity: 2, product: prod() }], "MDP");
    expect(plan.batches).toHaveLength(1);
    expect(plan.batches[0]).toMatchObject({ key: "LATER", delivery: "Llega en 5 a 10 días" });
    expect(plan.items).toEqual([{ productId: "a", quantity: 2, source: "ENCARGO" }]);
  });

  it("carrito mixto → dos tandas", () => {
    const plan = planCart(
      [
        { productId: "a", quantity: 1, product: prod({ localQuantity: 1 }) },
        { productId: "b", quantity: 1, product: prod() },
      ],
      "MDP",
    );
    expect(isMixedCart(plan)).toBe(true);
    expect(plan.batches.map((b) => b.key)).toEqual(["TODAY", "LATER"]);
  });

  it("'todo junto' → una sola tanda con lo que tarda más", () => {
    const plan = planCart(
      [
        { productId: "a", quantity: 1, product: prod({ localQuantity: 1 }) },
        { productId: "b", quantity: 1, product: prod() },
      ],
      "MDP",
      { deliverTogether: true },
    );
    expect(plan.batches).toHaveLength(1);
    expect(plan.batches[0]).toMatchObject({ key: "LATER", delivery: "Llega en 5 a 10 días" });
    expect(plan.batches[0].items).toHaveLength(2);
  });

  it("una línea con poco stock local se parte entre las dos tandas", () => {
    const plan = planCart(
      [{ productId: "a", quantity: 3, product: prod({ localQuantity: 1 }) }],
      "MDP",
    );
    expect(plan.items).toEqual([
      { productId: "a", quantity: 1, source: "LOCAL" },
      { productId: "a", quantity: 2, source: "ENCARGO" },
    ]);
    expect(plan.unavailable).toEqual([]);
  });

  it("lo que no cubren local ni SM queda no disponible", () => {
    const plan = planCart(
      [
        {
          productId: "a",
          quantity: 5,
          product: prod({
            localQuantity: 1,
            offers: [{ supplier: "SM", mode: "STOCK", stock: 2 }],
          }),
        },
      ],
      "MDP",
    );
    expect(plan.items.reduce((a, i) => a + i.quantity, 0)).toBe(3);
    expect(plan.unavailable).toEqual([{ productId: "a", quantity: 2 }]);
  });

  it("consumibles sí se venden en MdP", () => {
    const plan = planCart(
      [{ productId: "gel", quantity: 1, product: prod({ isConsumable: true }) }],
      "MDP",
    );
    expect(plan.items[0].source).toBe("ENCARGO");
  });
});

describe("carrito fuera de MdP", () => {
  it("AMBA: dropship en una tanda de 48 h", () => {
    const plan = planCart([{ productId: "a", quantity: 2, product: prod() }], "AMBA");
    expect(plan.batches).toEqual([
      {
        key: "LATER",
        delivery: "Llega en 48 h",
        items: [{ productId: "a", quantity: 2, source: "DROPSHIP" }],
      },
    ]);
  });

  it("Interior: dropship con su plazo", () => {
    const plan = planCart([{ productId: "a", quantity: 1, product: prod() }], "INTERIOR");
    expect(plan.batches[0].delivery).toBe("Envío 3 a 6 días");
  });

  it("AMBA sin stock del proveedor → no disponible", () => {
    const plan = planCart(
      [
        {
          productId: "a",
          quantity: 1,
          product: prod({ offers: [{ supplier: "SM", mode: "DROPSHIP", stock: 0 }] }),
        },
      ],
      "AMBA",
    );
    expect(plan.items).toEqual([]);
    expect(plan.batches).toEqual([]);
    expect(plan.unavailable).toEqual([{ productId: "a", quantity: 1 }]);
  });

  it("AMBA: el stock local de MdP no cuenta", () => {
    const plan = planCart(
      [{ productId: "a", quantity: 1, product: prod({ localQuantity: 5, offers: [] }) }],
      "AMBA",
    );
    expect(plan.unavailable).toEqual([{ productId: "a", quantity: 1 }]);
  });

  it("dropship no se parte: si la oferta no cubre la cantidad, no hay", () => {
    const plan = planCart([{ productId: "a", quantity: 11, product: prod() }], "AMBA");
    expect(plan.items).toEqual([]);
    expect(plan.unavailable).toEqual([{ productId: "a", quantity: 11 }]);
  });

  it("consumibles nunca por dropship", () => {
    const plan = planCart(
      [{ productId: "gel", quantity: 1, product: prod({ isConsumable: true }) }],
      "INTERIOR",
    );
    expect(plan.unavailable).toEqual([{ productId: "gel", quantity: 1 }]);
  });

  it("solo ofertas en modo DROPSHIP sirven fuera de MdP", () => {
    const plan = planCart(
      [
        {
          productId: "a",
          quantity: 1,
          product: prod({ offers: [{ supplier: "SM", mode: "STOCK", stock: 9 }] }),
        },
      ],
      "AMBA",
    );
    expect(plan.items).toEqual([]);
  });
});

it("rechaza cantidades inválidas", () => {
  expect(() => planCart([{ productId: "a", quantity: 0, product: prod() }], "MDP")).toThrow(
    /inválida/,
  );
  expect(() => planCart([{ productId: "a", quantity: 1.5, product: prod() }], "MDP")).toThrow(
    /inválida/,
  );
});

it("carrito vacío no tiene tandas", () => {
  expect(planCart([], "MDP")).toEqual({ items: [], batches: [], unavailable: [] });
});

describe("base del envío gratis", () => {
  const price = (id: string) => ({ a: 11_900, b: 42_500 })[id] ?? 0;
  const lines = [
    { productId: "a", quantity: 2, product: prod({ localQuantity: 5 }) },
    { productId: "b", quantity: 1, product: prod() },
  ];

  it("MdP en dos tandas → mide solo lo que llega hoy", () => {
    expect(freeShippingBase(planCart(lines, "MDP"), price)).toBe(23_800);
  });

  it("MdP todo junto → mide todo el carrito", () => {
    expect(freeShippingBase(planCart(lines, "MDP", { deliverTogether: true }), price)).toBe(66_300);
  });

  it("AMBA → todo lo que sale por dropship; lo no disponible no cuenta", () => {
    const amba = [
      { productId: "b", quantity: 1, product: prod() },
      { productId: "a", quantity: 1, product: prod({ isConsumable: true }) },
    ];
    expect(freeShippingBase(planCart(amba, "AMBA"), price)).toBe(42_500);
  });

  it("carrito vacío → 0", () => {
    expect(freeShippingBase(planCart([], "MDP"), price)).toBe(0);
  });
});
