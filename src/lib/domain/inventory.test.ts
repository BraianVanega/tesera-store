import { describe, expect, it } from "vitest";
import {
  StockError,
  assertValidMovement,
  availableQuantity,
  commitReservation,
  quantityFromMovements,
  release,
  reserve,
  sell,
} from "./inventory";

describe("movimientos", () => {
  it("recalcula el stock sumando movimientos", () => {
    expect(quantityFromMovements([])).toBe(0);
    expect(
      quantityFromMovements([
        { type: "IN", quantity: 5 },
        { type: "SALE", quantity: -2 },
        { type: "RETURN", quantity: 1 },
        { type: "ADJUST", quantity: -1 },
        { type: "ADJUST", quantity: 2 },
      ]),
    ).toBe(5);
  });

  it("rechaza signos incorrectos, ceros y decimales", () => {
    expect(() => assertValidMovement({ type: "IN", quantity: -1 })).toThrow(StockError);
    expect(() => assertValidMovement({ type: "RETURN", quantity: -1 })).toThrow(StockError);
    expect(() => assertValidMovement({ type: "SALE", quantity: 1 })).toThrow(StockError);
    expect(() => assertValidMovement({ type: "ADJUST", quantity: 0 })).toThrow(StockError);
    expect(() => assertValidMovement({ type: "IN", quantity: 1.5 })).toThrow(StockError);
  });

  it("nunca deja el stock en negativo", () => {
    expect(() =>
      quantityFromMovements([
        { type: "IN", quantity: 1 },
        { type: "SALE", quantity: -2 },
      ]),
    ).toThrow(/negativo/);
  });
});

describe("reservas", () => {
  const s = { quantity: 3, reserved: 1 };

  it("disponible = físico − reservado, piso 0", () => {
    expect(availableQuantity(s)).toBe(2);
    expect(availableQuantity({ quantity: 1, reserved: 3 })).toBe(0);
  });

  it("reserva si alcanza y falla si no (sin sobreventa)", () => {
    expect(reserve(s, 2)).toEqual({ quantity: 3, reserved: 3 });
    expect(() => reserve(s, 3)).toThrow(/insuficiente/);
    expect(() => reserve(s, 0)).toThrow(StockError);
  });

  it("libera una reserva y no deja reservas negativas", () => {
    expect(release(s, 1)).toEqual({ quantity: 3, reserved: 0 });
    expect(() => release(s, 2)).toThrow(/reservadas/);
  });

  it("al pagar, la reserva pasa a venta con su movimiento SALE", () => {
    expect(commitReservation(s, 1)).toEqual({
      level: { quantity: 2, reserved: 0 },
      movement: { type: "SALE", quantity: -1 },
    });
  });

  it("detecta reservas que el stock físico no cubre", () => {
    expect(() => commitReservation({ quantity: 0, reserved: 1 }, 1)).toThrow(/no cubre/);
  });

  it("venta directa sin reserva previa", () => {
    expect(sell({ quantity: 2, reserved: 0 }, 2).level).toEqual({ quantity: 0, reserved: 0 });
    expect(() => sell({ quantity: 2, reserved: 2 }, 1)).toThrow(/insuficiente/);
  });
});
