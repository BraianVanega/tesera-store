import { describe, expect, it } from "vitest";
import { config } from "../config";
import { allocateByValue, dropshipOrderMargin, unitCostWithShipping } from "./pricing";
import { isCaba, isMdp } from "./zone";

describe("prorrateo del envío semanal (por valor)", () => {
  it("reparte proporcional al valor y suma exacto", () => {
    expect(
      allocateByValue(
        [
          { value: 3_000, quantity: 1 },
          { value: 1_000, quantity: 1 },
        ],
        4_000,
      ),
    ).toEqual([3_000, 1_000]);
    const r = allocateByValue(
      [
        { value: 1, quantity: 1 },
        { value: 1, quantity: 1 },
        { value: 1, quantity: 1 },
      ],
      100,
    );
    expect(r.reduce((a, b) => a + b, 0)).toBe(100);
    expect(r.every(Number.isInteger)).toBe(true);
  });
  it("si nada tiene valor, reparte por cantidad", () => {
    expect(
      allocateByValue(
        [
          { value: 0, quantity: 3 },
          { value: 0, quantity: 1 },
        ],
        400,
      ),
    ).toEqual([300, 100]);
  });
  it("casos borde", () => {
    expect(allocateByValue([], 500)).toEqual([]);
    expect(allocateByValue([{ value: 10, quantity: 1 }], 0)).toEqual([0]);
    expect(() => allocateByValue([{ value: 0, quantity: 0 }], 10)).toThrow(/base/);
    expect(() => allocateByValue([{ value: 1, quantity: 1 }], -1)).toThrow(/Total/);
    expect(() => allocateByValue([{ value: 1, quantity: 1 }], 1.5)).toThrow(/Total/);
  });
  it("costo unitario con envío, en pesos enteros", () => {
    expect(unitCostWithShipping(2_000, 1_000, 3)).toBe(2_333);
    expect(() => unitCostWithShipping(2_000, 1_000, 0)).toThrow(/Cantidad/);
  });
});

describe("bordes", () => {
  it("margen de un pedido vacío no divide por cero", () => {
    expect(dropshipOrderMargin([]).marginPct).toBe(0);
  });
  it("CP inválido no es MdP ni CABA", () => {
    expect(isMdp("")).toBe(false);
    expect(isCaba("abc")).toBe(false);
  });
});

describe("textos al cliente", () => {
  it("ningún plazo dice 'encargo'", () => {
    for (const t of Object.values(config.delivery))
      expect(t.toLowerCase()).not.toContain("encargo");
  });
});
