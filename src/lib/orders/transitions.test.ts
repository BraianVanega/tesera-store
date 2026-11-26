import type {
  EncargoStatus as DbEncargoStatus,
  OrderStatus as DbOrderStatus,
  RestockStatus as DbRestockStatus,
} from "@prisma/client";
import type { EncargoStatus, OrderStatus, RestockStatus } from "./transitions";

import { describe, expect, it } from "vitest";
import {
  ENCARGO_STATUS_LABEL,
  ORDER_STATUS_LABEL,
  TransitionError,
  encargoTransitions as enc,
  orderTransitions as ord,
  restockTransitions as rst,
} from "./transitions";

describe("pedido", () => {
  it("camino feliz completo", () => {
    expect(ord.assert("PENDING_PAYMENT", "PAID")).toBe("PAID");
    expect(ord.can("PAID", "FULFILLING")).toBe(true);
    expect(ord.can("FULFILLING", "SHIPPED")).toBe(true);
    expect(ord.can("SHIPPED", "DELIVERED")).toBe(true);
  });

  it("no se saltean pasos ni se vuelve atrás", () => {
    expect(ord.can("PENDING_PAYMENT", "SHIPPED")).toBe(false);
    expect(ord.can("PAID", "PENDING_PAYMENT")).toBe(false);
    expect(ord.can("DELIVERED", "SHIPPED")).toBe(false);
    expect(() => ord.assert("PAID", "DELIVERED")).toThrow(TransitionError);
    expect(() => ord.assert("PAID", "DELIVERED")).toThrow("pedido: PAID → DELIVERED");
  });

  it("transferencia vencida → CANCELLED; cancelado es final", () => {
    expect(ord.can("PENDING_PAYMENT", "CANCELLED")).toBe(true);
    expect(ord.isFinal("CANCELLED")).toBe(true);
    expect(ord.next("CANCELLED")).toEqual([]);
  });

  it("reembolso o arrepentimiento: se cancela desde cualquier estado pago", () => {
    for (const s of ["PAID", "FULFILLING", "SHIPPED", "DELIVERED"] as const) {
      expect(ord.can(s, "CANCELLED")).toBe(true);
    }
    expect(ord.isFinal("DELIVERED")).toBe(false);
  });
});

describe("encargo", () => {
  it("PENDIENTE → PEDIDO_A_PROVEEDOR → RECIBIDO → ENTREGADO", () => {
    expect(enc.can("PENDIENTE", "PEDIDO_A_PROVEEDOR")).toBe(true);
    expect(enc.can("PEDIDO_A_PROVEEDOR", "RECIBIDO")).toBe(true);
    expect(enc.can("RECIBIDO", "ENTREGADO")).toBe(true);
    expect(enc.can("PENDIENTE", "ENTREGADO")).toBe(false);
    expect(enc.isFinal("ENTREGADO")).toBe(true);
    expect(enc.can("ENTREGADO", "CANCELADO")).toBe(false);
  });
});

describe("pedido semanal", () => {
  it("BORRADOR → ENVIADO → RECIBIDO", () => {
    expect(rst.can("BORRADOR", "ENVIADO")).toBe(true);
    expect(rst.can("ENVIADO", "RECIBIDO")).toBe(true);
    expect(rst.can("BORRADOR", "RECIBIDO")).toBe(false);
  });
});

describe("textos al cliente", () => {
  it("nunca dicen 'encargo'", () => {
    const all = [...Object.values(ORDER_STATUS_LABEL), ...Object.values(ENCARGO_STATUS_LABEL)];
    for (const t of all) expect(t.toLowerCase()).not.toContain("encargo");
  });
  it("coinciden con docs/02", () => {
    expect(Object.values(ORDER_STATUS_LABEL)).toEqual([
      "Pendiente de pago",
      "Pagado",
      "En preparación",
      "Enviado",
      "Entregado",
      "Cancelado",
    ]);
  });
});

// Chequeo de tipos: los estados del dominio son exactamente los enums de Prisma.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const sameEnums: [
  Same<OrderStatus, DbOrderStatus>,
  Same<EncargoStatus, DbEncargoStatus>,
  Same<RestockStatus, DbRestockStatus>,
] = [true, true, true];
it("los estados coinciden con el esquema de Prisma", () =>
  expect(sameEnums).toEqual([true, true, true]));
