import { config } from "../config";
import { availability } from "../domain/availability";
import { transferPrice } from "../domain/pricing";
import type { CatalogProduct } from "../catalog/queries";
import { formatMoney } from "./format";
import { type ShopZone, zoneLabel } from "./session";

/**
 * Modelos de vista de la tienda: traducen lo que decide el dominio (availability, pricing) a
 * textos y estilos del diseño. La UI solo renderiza esto; nunca decide disponibilidad.
 */

/** Clases del diseño (tienda.css): b-hoy resaltado, b-enc como plazo normal, b-env, b-no. */
export type BadgeKind = "hoy" | "plazo" | "envio" | "no" | "zona";

export type ProductBadge = { kind: BadgeKind; text: string; available: boolean };

export const NO_ZONE_TEXT = "Elegí tu zona para ver el envío";
/** Versión corta para el badge sobre la foto. */
export const NO_ZONE_BADGE = "Elegí tu zona";
export const UNAVAILABLE_TEXT = "No disponible en tu zona";

export function productBadge(p: CatalogProduct, zone: ShopZone | null): ProductBadge {
  if (!zone) return { kind: "zona", text: NO_ZONE_BADGE, available: true };
  const a = availability(p.availabilityInput, zone.zone);
  if (!a.available) return { kind: "no", text: UNAVAILABLE_TEXT, available: false };
  const kind: BadgeKind = a.source === "LOCAL" ? "hoy" : a.source === "ENCARGO" ? "plazo" : "envio";
  return { kind, text: a.delivery, available: true };
}

export type PriceView = { list: string; transfer: string };

export function priceView(listPrice: number): PriceView {
  return { list: formatMoney(listPrice), transfer: formatMoney(transferPrice(listPrice)) };
}

// ── Filtros del catálogo ─────────────────────────────

export const PRICE_RANGES = [
  { key: "hasta-20000", label: "Hasta $\u00a020.000", min: 0, max: 20_000 },
  { key: "20000-40000", label: "$\u00a020.000 a $\u00a040.000", min: 20_000, max: 40_000 },
  { key: "mas-de-40000", label: "Más de $\u00a040.000", min: 40_000, max: Infinity },
] as const;

export type PriceRangeKey = (typeof PRICE_RANGES)[number]["key"];

export function priceRange(key: string | undefined) {
  return PRICE_RANGES.find((r) => r.key === key);
}

export type CatalogFilters = { today: boolean; price?: PriceRangeKey };

/** "Entrega hoy" solo tiene sentido en MdP: fuera de MdP se ignora. */
export function filterCatalog(
  products: CatalogProduct[],
  filters: CatalogFilters,
  zone: ShopZone | null,
): CatalogProduct[] {
  const range = priceRange(filters.price);
  return products.filter((p) => {
    if (range && (p.price < range.min || p.price >= range.max)) return false;
    if (filters.today && zone?.zone === "MDP") {
      const a = availability(p.availabilityInput, "MDP");
      if (!a.available || a.source !== "LOCAL") return false;
    }
    return true;
  });
}

// ── Textos de envío por zona ─────────────────────────

export type ShippingCopy = { eyebrow: string; title: string; text: string };

const money = formatMoney;

/** Banda de envíos de la home y caja de envío de la ficha. Montos siempre desde config. */
export function shippingCopy(zone: ShopZone | null): ShippingCopy {
  const f = config.freeShipping;
  if (!zone) {
    return {
      eyebrow: "envíos",
      title: "envío gratis según tu zona",
      text: "Ingresá tu CP y te mostramos desde qué monto no pagás envío.",
    };
  }
  if (zone.zone === "MDP") {
    return {
      eyebrow: "mar del plata",
      title: `gratis desde ${money(f.MDP)}`,
      text: "Con productos en stock local, lo recibís hoy con cadete.",
    };
  }
  if (zone.zone === "AMBA") {
    return {
      eyebrow: "caba y gba",
      title: `gratis desde ${money(zoneLabel(zone) === "CABA" ? f.CABA : f.GBA)}`,
      text: `En CABA, gratis desde ${money(f.CABA)}; en GBA, desde ${money(f.GBA)}. ${config.delivery.DROPSHIP_AMBA}.`,
    };
  }
  return {
    eyebrow: "todo el país",
    title: "envíos a todo el país",
    text: `Pagás el costo cotizado al comprar. ${config.delivery.DROPSHIP_INTERIOR}, en caja neutra.`,
  };
}

/** Caja de envío de la ficha según lo que decidió availability(). */
export function deliveryNote(
  badge: ProductBadge,
  zone: ShopZone | null,
): { title: string; text: string } {
  const f = config.freeShipping;
  if (!zone) return { title: NO_ZONE_TEXT, text: "Con tu CP te mostramos plazo y costo de envío." };
  if (!badge.available)
    return {
      title: UNAVAILABLE_TEXT,
      text: "No llega a tu código postal. Mirá el resto del catálogo.",
    };
  if (badge.kind === "hoy") {
    return {
      title: "Lo recibís hoy con cadete",
      text: `Entrega en el día en Mar del Plata. Envío gratis desde ${money(f.MDP)}.`,
    };
  }
  if (badge.kind === "plazo") {
    return {
      title: badge.text,
      text: `Te avisamos cuando esté listo para entregar en Mar del Plata. Envío gratis desde ${money(f.MDP)}.`,
    };
  }
  if (zone.zone === "AMBA") {
    return {
      title: badge.text,
      text: `Gratis desde ${money(f.CABA)} en CABA y desde ${money(f.GBA)} en GBA. Si no, lo ves al elegir el envío.`,
    };
  }
  return { title: badge.text, text: "Pagás el costo cotizado según tu CP. Lo ves antes de pagar." };
}
