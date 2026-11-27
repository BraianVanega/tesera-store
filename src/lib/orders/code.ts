import { randomBytes, randomInt, timingSafeEqual } from "node:crypto";

/**
 * Códigos de pedido legibles y NO secuenciales (no exponen el volumen, docs/03): `TS-7K3QX9`.
 * Alfabeto sin caracteres ambiguos (0/O, 1/I/L). 30^6 ≈ 729 M combinaciones.
 */
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export function orderCode(rand: (max: number) => number = randomInt): string {
  let s = "";
  for (let i = 0; i < 6; i++) s += ALPHABET[rand(ALPHABET.length)];
  return `TS-${s}`;
}

export const ORDER_CODE_RE = /^TS-[2-9A-HJKMNP-Z]{6}$/;

/** Token del link de seguimiento (`/pedido/[code]?t=`): 24 bytes en base64url. */
export function trackingToken(): string {
  return randomBytes(24).toString("base64url");
}

/** Comparación en tiempo constante (no filtra el token por timing). */
export function safeTokenEqual(given: string | null | undefined, expected: string): boolean {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
