import { z } from "zod";
import type { Zone } from "../config";
import { detectZone, isCaba, postalNumber } from "../domain/zone";

/**
 * Estado de la tienda que vive en cookies PROPIAS (nunca se mandan a terceros, docs/07):
 * - `tsr_zona`: CP y zona (no es PII fuerte).
 * - `tsr_carrito`: ids y cantidades, sin nombres de producto.
 * - `tsr_discreto`: modo discreto (lo lee un script inline antes del primer pintado).
 * No son httpOnly a propósito: "Salir ya" las borra del lado del cliente en el acto.
 * Todo lo que se lee de una cookie pasa por Zod: la cookie es input externo.
 */

export { COOKIES, COOKIE_MAX_AGE } from "./constants";

// ── Zona ─────────────────────────────────────────────

export type ShopZone = { zone: Zone; cp: string };

const zoneSchema = z.object({
  zone: z.enum(["MDP", "AMBA", "INTERIOR"]),
  cp: z.string().regex(/^\d{4}$/),
});

/** Normaliza lo que escribe el cliente ("B7600", " 7600 ", "C1425ABC") a 4 dígitos, o null. */
export function normalizeCp(input: string): string | null {
  const trimmed = input.trim();
  if (!/^[A-Za-z]?\d{4}[A-Za-z]{0,3}$/.test(trimmed)) return null;
  const n = postalNumber(trimmed);
  return n === null || n < 1000 ? null : String(n);
}

/**
 * Zona a partir del CP, SIN cotización (respaldo cuando SM no responde). GBA no se distingue del
 * Interior solo por CP: la tienda usa `zoneForCp()` (src/lib/sm/server.ts), que cotiza con SM.
 */
export function zoneFromCp(cp: string): ShopZone {
  return { zone: detectZone(cp), cp };
}

export function serializeZone(z: ShopZone): string {
  return `${z.zone}:${z.cp}`;
}

export function parseZone(raw: string | undefined): ShopZone | null {
  if (!raw) return null;
  const [zone, cp] = raw.split(":");
  const r = zoneSchema.safeParse({ zone, cp });
  return r.success ? r.data : null;
}

/** "Mar del Plata", "CABA", "GBA" o "Interior". */
export function zoneLabel(z: ShopZone): string {
  if (z.zone === "MDP") return "Mar del Plata";
  if (z.zone === "AMBA") return isCaba(z.cp) ? "CABA" : "GBA";
  return "Interior";
}

// ── Carrito ──────────────────────────────────────────

export const MAX_LINE_QTY = 20;
export const MAX_CART_LINES = 30;

export type CartLineRef = { id: string; qty: number };
export type CartCookie = { lines: CartLineRef[]; together: boolean };

export const EMPTY_CART: CartCookie = { lines: [], together: false };

const cartSchema = z.object({
  l: z
    .array(z.tuple([z.string().min(1).max(40), z.number().int().min(1).max(MAX_LINE_QTY)]))
    .max(MAX_CART_LINES),
  j: z.union([z.literal(0), z.literal(1)]),
});

export function parseCart(raw: string | undefined): CartCookie {
  if (!raw) return EMPTY_CART;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return EMPTY_CART;
  }
  const r = cartSchema.safeParse(json);
  if (!r.success) return EMPTY_CART;
  return { lines: r.data.l.map(([id, qty]) => ({ id, qty })), together: r.data.j === 1 };
}

export function serializeCart(c: CartCookie): string {
  return JSON.stringify({ l: c.lines.map((l) => [l.id, l.qty]), j: c.together ? 1 : 0 });
}

/** Suma (o resta) unidades. Con 0 o menos, la línea se va. Respeta los topes. */
export function changeQty(c: CartCookie, id: string, delta: number): CartCookie {
  const current = c.lines.find((l) => l.id === id)?.qty ?? 0;
  return setQty(c, id, current + delta);
}

export function setQty(c: CartCookie, id: string, qty: number): CartCookie {
  const q = Math.min(MAX_LINE_QTY, Math.trunc(qty));
  const exists = c.lines.some((l) => l.id === id);
  if (q <= 0) return { ...c, lines: c.lines.filter((l) => l.id !== id) };
  if (exists) return { ...c, lines: c.lines.map((l) => (l.id === id ? { id, qty: q } : l)) };
  if (c.lines.length >= MAX_CART_LINES) return c;
  return { ...c, lines: [...c.lines, { id, qty: q }] };
}

export function cartUnits(c: CartCookie): number {
  return c.lines.reduce((acc, l) => acc + l.qty, 0);
}
