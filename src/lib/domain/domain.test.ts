import { describe, expect, it } from "vitest";
import { availability, type ProductLike } from "./availability";
import {
  dropshipOrderCost,
  dropshipOrderMargin,
  freeShippingStatus,
  orderTotals,
  transferPrice,
} from "./pricing";
import { detectZone, freeShippingKey, isCaba, isMdp, postalNumber } from "./zone";

describe("zone", () => {
  it("extrae el número del CP", () => {
    expect(postalNumber("7600")).toBe(7600);
    expect(postalNumber("B7600XYZ")).toBe(7600);
    expect(postalNumber("abc")).toBeNull();
  });
  it("MdP 7600–7612", () => {
    expect(isMdp("7600")).toBe(true);
    expect(isMdp("7612")).toBe(true);
    expect(isMdp("7613")).toBe(false);
    expect(isMdp("7599")).toBe(false);
  });
  it("CABA por CP", () => {
    expect(isCaba("C1425")).toBe(true);
    expect(isCaba("1824")).toBe(false);
  });
  it("detecta zona con y sin cotización", () => {
    expect(detectZone("7600")).toBe("MDP");
    expect(detectZone("1824", [{ code: "moova-flex" }, { code: "ca-cp-dom" }])).toBe("AMBA");
    expect(detectZone("5000", [{ code: "ca-cp-dom" }])).toBe("INTERIOR");
    expect(detectZone("1425")).toBe("AMBA"); // sin cotización, CABA por CP
    expect(detectZone("1824")).toBe("INTERIOR"); // sin cotización, GBA no se infiere
  });
  it("clave de envío gratis", () => {
    expect(freeShippingKey("MDP", "7600")).toBe("MDP");
    expect(freeShippingKey("AMBA", "1425")).toBe("CABA");
    expect(freeShippingKey("AMBA", "1824")).toBe("GBA");
    expect(freeShippingKey("INTERIOR", "5000")).toBe("INTERIOR");
  });
});

describe("pricing", () => {
  it("transferencia = lista − 10 %, entero", () => {
    expect(transferPrice(10_000)).toBe(9_000);
    expect(transferPrice(24_990)).toBe(22_491);
    expect(Number.isInteger(transferPrice(12_345))).toBe(true);
  });
  it("envío gratis se calcula sobre lista", () => {
    const s = freeShippingStatus(14_000, "MDP", "7600");
    expect(s).toEqual({ threshold: 15_000, remaining: 1_000, isFree: false });
    expect(freeShippingStatus(15_000, "MDP", "7600").isFree).toBe(true);
    expect(freeShippingStatus(29_999, "AMBA", "1425").isFree).toBe(false);
    expect(freeShippingStatus(40_000, "AMBA", "1824").isFree).toBe(true);
  });
  it("interior no tiene envío gratis", () => {
    const s = freeShippingStatus(500_000, "INTERIOR", "5000");
    expect(s.isFree).toBe(false);
    expect(s.threshold).toBeNull();
  });
  it("el descuento por transferencia no altera el umbral (lista)", () => {
    // 16.000 de lista califica en MdP aunque con transferencia sean 14.400
    const t = orderTotals({
      lines: [{ unitPrice: 16_000, quantity: 1 }],
      zone: "MDP",
      cp: "7600",
      paymentMethod: "TRANSFER",
      quotedShipping: 3_000,
    });
    expect(t.shippingCharged).toBe(0);
    expect(t.discount).toBe(1_600);
    expect(t.total).toBe(14_400);
  });
  it("cobra el envío si no alcanza el umbral", () => {
    const t = orderTotals({
      lines: [{ unitPrice: 5_000, quantity: 2 }],
      zone: "AMBA",
      cp: "1425",
      paymentMethod: "MP",
      quotedShipping: 7_100,
    });
    expect(t).toEqual({ subtotal: 10_000, discount: 0, shippingCharged: 7_100, total: 17_100 });
  });
});

describe("dropship cost", () => {
  it("el cargo de $2.300 es por pedido, no por unidad", () => {
    expect(dropshipOrderCost([{ listPrice: 9_000, costoCliente: 2_000, quantity: 1 }])).toBe(4_300);
    expect(dropshipOrderCost([{ listPrice: 9_000, costoCliente: 2_000, quantity: 3 }])).toBe(8_300);
  });
  it("margen del pedido descuenta costo y comisión", () => {
    const m = dropshipOrderMargin([{ listPrice: 9_000, costoCliente: 2_000, quantity: 1 }]);
    expect(m.cost).toBe(4_300);
    expect(m.mpFee).toBe(450);
    expect(m.margin).toBe(4_250);
  });
});

describe("availability", () => {
  const base: ProductLike = {
    isConsumable: false,
    localQuantity: 0,
    offers: [{ supplier: "SM", mode: "DROPSHIP", stock: 5 }],
  };
  it("MdP: LOCAL si hay stock local", () => {
    expect(availability({ ...base, localQuantity: 2 }, "MDP")).toMatchObject({ source: "LOCAL" });
  });
  it("MdP: ENCARGO si no hay local pero SM tiene", () => {
    expect(availability(base, "MDP")).toMatchObject({ source: "ENCARGO" });
  });
  it("MdP: no disponible sin local ni SM", () => {
    expect(availability({ ...base, offers: [] }, "MDP")).toEqual({ available: false });
  });
  it("AMBA / Interior: DROPSHIP con plazos distintos", () => {
    expect(availability(base, "AMBA")).toMatchObject({
      source: "DROPSHIP",
      delivery: "Llega en 48 h",
    });
    expect(availability(base, "INTERIOR")).toMatchObject({ delivery: "Envío 3 a 6 días" });
  });
  it("consumibles nunca por dropship", () => {
    expect(availability({ ...base, isConsumable: true }, "AMBA")).toEqual({ available: false });
    expect(availability({ ...base, isConsumable: true }, "INTERIOR")).toEqual({ available: false });
  });
  it("consumible en MdP sí (local o encargo)", () => {
    expect(availability({ ...base, isConsumable: true }, "MDP")).toMatchObject({
      source: "ENCARGO",
    });
  });
  it("sin stock de proveedor → no disponible fuera de MdP", () => {
    expect(
      availability({ ...base, offers: [{ supplier: "SM", mode: "DROPSHIP", stock: 0 }] }, "AMBA"),
    ).toEqual({ available: false });
  });
});
