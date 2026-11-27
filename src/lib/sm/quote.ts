import type { Zone } from "../config";
import { config } from "../config";
import { toPesos } from "../domain/pricing";
import { detectZone } from "../domain/zone";
import type { SmClient } from "./client";
import type { SmQuote, SmQuoteRequest } from "./schemas";

/**
 * Cotización de envío de SM (docs/04 "Cotizar envío").
 *
 * Se cotiza dos veces:
 * - **carrito** (`stage: "cart"`): solo CP → precio orientativo. Su `quoteId` NO se guarda
 *   (es la estimación más cara).
 * - **checkout** (`stage: "checkout"`): con calle y número (y sucursal si aplica) → el `quoteId`
 *   que se manda al crear el pedido.
 */

export type QuoteStage = "cart" | "checkout";

export type ShippingQuoteOption = {
  /** Lo único que se guarda para pedir esta opción (`moova-flex`, `ca-cp-dom`, …). */
  code: string;
  carrier: string;
  label: string;
  toAgency: boolean;
  /** Pesos enteros, final con impuestos. */
  price: number;
  /** Días hábiles incluyendo la preparación del pedido. */
  minDays: number;
  maxDays: number;
};

export type ShippingQuote = {
  stage: QuoteStage;
  zone: Zone;
  /** Solo en checkout y solo si SM lo devolvió (cotizaciones con ítems). */
  quoteId: string | null;
  expiresAt: string | null;
  options: ShippingQuoteOption[];
};

export type QuoteInput = {
  cp: string;
  items: { sku: string; cantidad: number }[];
  provinciaId?: number;
  localidad?: string;
  calle?: string;
  numero?: string;
  agencyId?: string;
};

/** Body para SM. Sin ítems (detección de zona) se manda el bulto de referencia. */
export function buildQuoteRequest(input: QuoteInput): SmQuoteRequest {
  const destino: SmQuoteRequest["destino"] = { cp: input.cp.trim() };
  if (input.provinciaId != null) destino.provinciaId = input.provinciaId;
  if (input.localidad) destino.localidad = input.localidad;
  if (input.calle) destino.calle = input.calle;
  if (input.numero) destino.numero = input.numero;
  if (input.agencyId) destino.agencyId = input.agencyId;
  return input.items.length > 0
    ? { destino, items: input.items }
    : { destino, paquete: { ...config.sm.probePackage } };
}

/** Pura: respuesta de SM → nuestro tipo. Opciones ordenadas por precio. */
export function mapQuote(
  cp: string,
  data: SmQuote,
  stage: QuoteStage,
  prepDays: number = config.sm.prepDays,
): ShippingQuote {
  const options = data.options
    .map((o) => ({
      code: o.code,
      carrier: o.carrier,
      label: o.nombre,
      toAgency: o.tipoEntrega === "S",
      price: toPesos(o.precio),
      minDays: o.plazoMinDias + prepDays,
      maxDays: o.plazoMaxDias + prepDays,
    }))
    .sort((a, b) => a.price - b.price || a.code.localeCompare(b.code));
  const checkout = stage === "checkout";
  return {
    stage,
    zone: detectZone(cp, options),
    quoteId: checkout ? (data.quoteId ?? null) : null,
    expiresAt: checkout ? (data.venceEn ?? null) : null,
    options,
  };
}

/** Clave de cache: destino + ítems (orden indistinto). */
export function quoteCacheKey(input: QuoteInput, stage: QuoteStage): string {
  const items = [...input.items]
    .sort((a, b) => a.sku.localeCompare(b.sku))
    .map((i) => `${i.sku}x${i.cantidad}`)
    .join(",");
  return [
    stage,
    input.cp.trim().toUpperCase(),
    input.provinciaId ?? "",
    (input.calle ?? "").trim().toLowerCase(),
    (input.numero ?? "").trim(),
    input.agencyId ?? "",
    items,
  ].join("|");
}

/** Cache en memoria con vencimiento (por instancia de función; suficiente para no repetir llamadas). */
export function createTtlCache<V>(ttlMs: number, maxEntries = 500, now = () => Date.now()) {
  const map = new Map<string, { at: number; value: V }>();
  return {
    get(key: string): V | undefined {
      const hit = map.get(key);
      if (!hit) return undefined;
      if (now() - hit.at > ttlMs) {
        map.delete(key);
        return undefined;
      }
      return hit.value;
    },
    set(key: string, value: V) {
      if (map.size >= maxEntries) map.delete(map.keys().next().value as string);
      map.set(key, { at: now(), value });
    },
  };
}

export function createQuoter(
  client: Pick<SmClient, "quote">,
  cache = createTtlCache<ShippingQuote>(config.sm.quoteCacheMinutes * 60_000),
) {
  return async function quote(input: QuoteInput, stage: QuoteStage): Promise<ShippingQuote> {
    const key = quoteCacheKey(input, stage);
    const hit = cache.get(key);
    if (hit) return hit;
    const result = mapQuote(input.cp, await client.quote(buildQuoteRequest(input)), stage);
    cache.set(key, result);
    return result;
  };
}
