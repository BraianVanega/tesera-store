/**
 * Stock local (Mar del Plata). Lógica pura: los movimientos son la fuente de verdad y
 * `LocalStock.quantity` es un caché que se recalcula con `quantityFromMovements`.
 *
 * Convención de signos (StockMovement.quantity):
 * - IN y RETURN: positivo (entra mercadería).
 * - SALE: negativo (sale mercadería).
 * - ADJUST: cualquier signo distinto de 0 (corrección de conteo, siempre con nota).
 */

export type MovementType = "IN" | "SALE" | "ADJUST" | "RETURN";
export type Movement = { type: MovementType; quantity: number };
export type StockLevel = { quantity: number; reserved: number };

export class StockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StockError";
  }
}

/** Valida que un movimiento respete la convención de signos y sea un entero. */
export function assertValidMovement(m: Movement): void {
  if (!Number.isInteger(m.quantity) || m.quantity === 0) {
    throw new StockError(`Cantidad inválida en movimiento ${m.type}: ${m.quantity}`);
  }
  if ((m.type === "IN" || m.type === "RETURN") && m.quantity < 0) {
    throw new StockError(`${m.type} tiene que ser positivo`);
  }
  if (m.type === "SALE" && m.quantity > 0) {
    throw new StockError("SALE tiene que ser negativo");
  }
}

/** Stock físico = suma de movimientos. Nunca puede quedar negativo. */
export function quantityFromMovements(movements: Movement[]): number {
  let total = 0;
  for (const m of movements) {
    assertValidMovement(m);
    total += m.quantity;
    if (total < 0) throw new StockError("Los movimientos dejan el stock en negativo");
  }
  return total;
}

/** Unidades que se pueden vender ahora (físico − reservado por transferencias pendientes). */
export function availableQuantity(s: StockLevel): number {
  return Math.max(0, s.quantity - s.reserved);
}

function assertPositiveInt(qty: number): void {
  if (!Number.isInteger(qty) || qty <= 0) throw new StockError(`Cantidad inválida: ${qty}`);
}

/** Reserva stock para un pedido PENDING_PAYMENT. Falla si no alcanza (evita sobreventa). */
export function reserve(s: StockLevel, qty: number): StockLevel {
  assertPositiveInt(qty);
  if (availableQuantity(s) < qty) {
    throw new StockError(`Stock insuficiente: disponible ${availableQuantity(s)}, pedido ${qty}`);
  }
  return { quantity: s.quantity, reserved: s.reserved + qty };
}

/** Libera una reserva (pedido vencido o cancelado antes de pagar). */
export function release(s: StockLevel, qty: number): StockLevel {
  assertPositiveInt(qty);
  if (s.reserved < qty) throw new StockError(`No hay ${qty} unidades reservadas para liberar`);
  return { quantity: s.quantity, reserved: s.reserved - qty };
}

/**
 * Pedido pagado: la reserva se convierte en venta.
 * Devuelve el nuevo nivel y el movimiento SALE que hay que registrar.
 */
export function commitReservation(
  s: StockLevel,
  qty: number,
): { level: StockLevel; movement: Movement } {
  const released = release(s, qty);
  if (released.quantity < qty) throw new StockError("El stock físico no cubre la reserva");
  return {
    level: { quantity: released.quantity - qty, reserved: released.reserved },
    movement: { type: "SALE", quantity: -qty },
  };
}

/** Venta sin reserva previa (pago con MP aprobado en el momento). */
export function sell(s: StockLevel, qty: number): { level: StockLevel; movement: Movement } {
  return commitReservation(reserve(s, qty), qty);
}
