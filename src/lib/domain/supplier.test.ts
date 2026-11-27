import { describe, expect, it } from "vitest";
import { effectiveSupplierStock } from "./supplier";

const now = new Date("2026-11-26T12:00:00Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);

describe("effectiveSupplierStock", () => {
  it("usa el stock si la oferta está fresca", () => {
    expect(effectiveSupplierStock({ stock: 7, syncedAt: hoursAgo(1) }, now, 6)).toBe(7);
  });
  it("justo en el límite sigue valiendo", () => {
    expect(effectiveSupplierStock({ stock: 3, syncedAt: hoursAgo(6) }, now, 6)).toBe(3);
  });
  it("oferta vieja = sin stock", () => {
    expect(effectiveSupplierStock({ stock: 20, syncedAt: hoursAgo(6.01) }, now, 6)).toBe(0);
  });
  it("nunca negativo", () => {
    expect(effectiveSupplierStock({ stock: -2, syncedAt: now }, now, 6)).toBe(0);
  });
  it("usa el valor de config por defecto", () => {
    expect(effectiveSupplierStock({ stock: 5, syncedAt: now }, now)).toBe(5);
  });
});
