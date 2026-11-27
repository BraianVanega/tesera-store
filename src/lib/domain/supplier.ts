import { config } from "../config";

/**
 * Stock de proveedor que se puede vender. Si la oferta no se sincronizó hace más de
 * `config.sm.staleHours`, se trata como sin stock (docs/04: "si el sync falla, sin stock").
 * Pura: `now` se pasa por parámetro.
 */
export function effectiveSupplierStock(
  offer: { stock: number; syncedAt: Date },
  now: Date,
  staleHours: number = config.sm.staleHours,
): number {
  const ageMs = now.getTime() - offer.syncedAt.getTime();
  return ageMs > staleHours * 3_600_000 ? 0 : Math.max(0, offer.stock);
}
