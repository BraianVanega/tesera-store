import { config, type Zone } from "../config";

export type Source = "LOCAL" | "ENCARGO" | "DROPSHIP";

export type OfferLike = {
  supplier: "SM" | "BUTTMAN";
  mode: "DROPSHIP" | "STOCK";
  stock: number;
};

export type ProductLike = {
  isConsumable: boolean;
  localQuantity: number; // LocalStock.quantity − reservas
  offers: OfferLike[];
};

export type Availability =
  { available: false } | { available: true; source: Source; delivery: string };

/**
 * Única fuente de verdad de disponibilidad. La UI solo renderiza el resultado.
 * - MdP: LOCAL → ENCARGO (si SM tiene stock) → no disponible.
 * - AMBA / Interior: DROPSHIP si hay oferta con stock y no es consumible.
 * Consumibles nunca van por dropship.
 */
export function availability(p: ProductLike, zone: Zone): Availability {
  if (zone === "MDP") {
    if (p.localQuantity > 0) {
      return { available: true, source: "LOCAL", delivery: config.delivery.LOCAL };
    }
    const sm = p.offers.find((o) => o.supplier === "SM" && o.stock > 0);
    if (sm) return { available: true, source: "ENCARGO", delivery: config.delivery.ENCARGO };
    return { available: false };
  }

  const drop = p.offers.find((o) => o.mode === "DROPSHIP" && o.stock > 0);
  if (drop && !p.isConsumable) {
    return {
      available: true,
      source: "DROPSHIP",
      delivery: zone === "AMBA" ? config.delivery.DROPSHIP_AMBA : config.delivery.DROPSHIP_INTERIOR,
    };
  }
  return { available: false };
}
