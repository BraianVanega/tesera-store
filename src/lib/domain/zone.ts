import { config, type Zone } from "../config";

export type ShippingOption = { code: string };

/** Extrae los 4 dígitos numéricos de un CP argentino ("7600", "B7600XYZ", "C1425"). */
export function postalNumber(cp: string): number | null {
  const m = /(\d{4})/.exec(cp.trim());
  return m ? Number(m[1]) : null;
}

export function isMdp(cp: string): boolean {
  const n = postalNumber(cp);
  if (n === null) return false;
  return n >= config.mdpPostalRange.from && n <= config.mdpPostalRange.to;
}

export function isCaba(cp: string): boolean {
  const n = postalNumber(cp);
  if (n === null) return false;
  return n >= config.cabaPostalRange.from && n <= config.cabaPostalRange.to;
}

/**
 * Zona de entrega.
 * - MdP: por CP (7600–7612).
 * - AMBA: la cotización de SM trae la opción `moova-flex` (YIP/Flex cubre CABA y GBA).
 * - Resto: Interior.
 * `quoteOptions` es opcional: sin cotización, CABA se infiere por CP y el resto cae en Interior.
 */
export function detectZone(cp: string, quoteOptions?: ShippingOption[]): Zone {
  if (isMdp(cp)) return "MDP";
  if (quoteOptions?.some((o) => o.code === "moova-flex")) return "AMBA";
  if (!quoteOptions && isCaba(cp)) return "AMBA";
  return "INTERIOR";
}

/** Clave para el umbral de envío gratis. */
export function freeShippingKey(zone: Zone, cp: string): "MDP" | "CABA" | "GBA" | "INTERIOR" {
  if (zone === "MDP") return "MDP";
  if (zone === "AMBA") return isCaba(cp) ? "CABA" : "GBA";
  return "INTERIOR";
}
