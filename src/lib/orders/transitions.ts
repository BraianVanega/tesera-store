/**
 * Máquina de estados de pedidos, encargos y pedidos semanales.
 * Nadie escribe `status` directo: todo cambio pasa por `assertTransition` (docs/03).
 * Lógica pura, sin I/O.
 */

export type OrderStatus =
  "PENDING_PAYMENT" | "PAID" | "FULFILLING" | "SHIPPED" | "DELIVERED" | "CANCELLED";

export type EncargoStatus =
  "PENDIENTE" | "PEDIDO_A_PROVEEDOR" | "RECIBIDO" | "ENTREGADO" | "CANCELADO";

export type RestockStatus = "BORRADOR" | "ENVIADO" | "RECIBIDO";

/**
 * Pedido: PENDING_PAYMENT → PAID → FULFILLING → SHIPPED → DELIVERED.
 * CANCELLED: desde pendiente (vencimiento) y desde cualquier estado pago (reembolso de MP,
 * docs/05; arrepentimiento hasta 10 días después de la entrega, docs/07).
 * Un pago `rejected` de MP NO cancela: el pedido sigue pendiente hasta vencer (docs/05).
 */
const ORDER: Record<OrderStatus, readonly OrderStatus[]> = {
  PENDING_PAYMENT: ["PAID", "CANCELLED"],
  PAID: ["FULFILLING", "CANCELLED"],
  FULFILLING: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["DELIVERED", "CANCELLED"],
  DELIVERED: ["CANCELLED"],
  CANCELLED: [],
};

const ENCARGO: Record<EncargoStatus, readonly EncargoStatus[]> = {
  PENDIENTE: ["PEDIDO_A_PROVEEDOR", "CANCELADO"],
  PEDIDO_A_PROVEEDOR: ["RECIBIDO", "CANCELADO"],
  RECIBIDO: ["ENTREGADO", "CANCELADO"],
  ENTREGADO: [],
  CANCELADO: [],
};

const RESTOCK: Record<RestockStatus, readonly RestockStatus[]> = {
  BORRADOR: ["ENVIADO"],
  ENVIADO: ["RECIBIDO"],
  RECIBIDO: [],
};

export class TransitionError extends Error {
  constructor(entity: string, from: string, to: string) {
    super(`Transición inválida de ${entity}: ${from} → ${to}`);
    this.name = "TransitionError";
  }
}

function make<S extends string>(entity: string, table: Record<S, readonly S[]>) {
  const can = (from: S, to: S) => table[from].includes(to);
  const assert = (from: S, to: S): S => {
    if (!can(from, to)) throw new TransitionError(entity, from, to);
    return to;
  };
  const isFinal = (s: S) => table[s].length === 0;
  return { can, assert, isFinal, next: (s: S) => table[s] };
}

export const orderTransitions = make<OrderStatus>("pedido", ORDER);
export const encargoTransitions = make<EncargoStatus>("encargo", ENCARGO);
export const restockTransitions = make<RestockStatus>("pedido semanal", RESTOCK);

/** Estado del pedido como lo ve el cliente (Seguimiento, docs/02). */
export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "Pendiente de pago",
  PAID: "Pagado",
  FULFILLING: "En preparación",
  SHIPPED: "Enviado",
  DELIVERED: "Entregado",
  CANCELLED: "Cancelado",
};

/**
 * Lo que no está en stock local, como lo ve el cliente (docs/02).
 * Nunca dice "encargo". CANCELADO se muestra con el estado del pedido.
 */
export const ENCARGO_STATUS_LABEL: Record<Exclude<EncargoStatus, "CANCELADO">, string> = {
  PENDIENTE: "Confirmado",
  PEDIDO_A_PROVEEDOR: "En camino a Mar del Plata",
  RECIBIDO: "Listo para entregar",
  ENTREGADO: "Entregado",
};
