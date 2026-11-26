import { config, type Zone } from "../config";
import type { ProductLike, Source } from "./availability";

/**
 * Armado del carrito por zona: decide de dónde sale cada unidad y en qué tanda llega.
 *
 * - MdP: primero stock local ("Llega hoy"); lo que falta, si SM tiene, se pide en el
 *   pedido semanal ("Llega en 5 a 10 días"). Una misma línea se puede partir en dos tandas.
 * - AMBA / Interior: todo por dropship si la oferta cubre la cantidad; consumibles nunca.
 * - "Prefiero recibir todo junto" (solo MdP): todo se entrega con la tanda que tarda más.
 *
 * El stock de SM no es el real (tope 20, docs/04): se usa como límite conservador.
 */

export type CartInputLine = { productId: string; quantity: number; product: ProductLike };

export type PlannedItem = { productId: string; quantity: number; source: Source };

export type Batch = { key: "TODAY" | "LATER"; delivery: string; items: PlannedItem[] };

export type CartPlan = {
  /** Una entrada por (producto, fuente). Cada una es un OrderItem. */
  items: PlannedItem[];
  /** Tandas de entrega en el orden en que llegan. */
  batches: Batch[];
  /** Unidades que no se pueden vender en esta zona (no entran al pedido). */
  unavailable: { productId: string; quantity: number }[];
};

function smStock(p: ProductLike): number {
  return Math.max(0, ...p.offers.filter((o) => o.supplier === "SM").map((o) => o.stock));
}

function dropshipStock(p: ProductLike): number {
  return Math.max(0, ...p.offers.filter((o) => o.mode === "DROPSHIP").map((o) => o.stock));
}

function planLine(line: CartInputLine, zone: Zone) {
  const out: PlannedItem[] = [];
  let missing = line.quantity;
  const take = (source: Source, max: number) => {
    const qty = Math.min(missing, Math.max(0, max));
    if (qty > 0) {
      out.push({ productId: line.productId, quantity: qty, source });
      missing -= qty;
    }
  };

  if (zone === "MDP") {
    take("LOCAL", line.product.localQuantity);
    take("ENCARGO", smStock(line.product));
  } else if (!line.product.isConsumable) {
    // Dropship no se parte: o la oferta cubre todo, o no hay.
    if (dropshipStock(line.product) >= line.quantity) take("DROPSHIP", line.quantity);
  }
  return { items: out, missing };
}

export function planCart(
  lines: CartInputLine[],
  zone: Zone,
  opts: { deliverTogether?: boolean } = {},
): CartPlan {
  const items: PlannedItem[] = [];
  const unavailable: CartPlan["unavailable"] = [];

  for (const line of lines) {
    if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
      throw new Error(`Cantidad inválida para ${line.productId}: ${line.quantity}`);
    }
    const r = planLine(line, zone);
    items.push(...r.items);
    if (r.missing > 0) unavailable.push({ productId: line.productId, quantity: r.missing });
  }

  return { items, batches: toBatches(items, zone, opts.deliverTogether ?? false), unavailable };
}

function toBatches(items: PlannedItem[], zone: Zone, together: boolean): Batch[] {
  if (items.length === 0) return [];
  if (zone !== "MDP") {
    const delivery =
      zone === "AMBA" ? config.delivery.DROPSHIP_AMBA : config.delivery.DROPSHIP_INTERIOR;
    return [{ key: "LATER", delivery, items }];
  }
  const today = items.filter((i) => i.source === "LOCAL");
  const later = items.filter((i) => i.source === "ENCARGO");
  if (later.length === 0) return [{ key: "TODAY", delivery: config.delivery.LOCAL, items: today }];
  if (today.length === 0 || together) {
    return [{ key: "LATER", delivery: config.delivery.ENCARGO, items }];
  }
  return [
    { key: "TODAY", delivery: config.delivery.LOCAL, items: today },
    { key: "LATER", delivery: config.delivery.ENCARGO, items: later },
  ];
}

/** ¿El carrito tiene dos tandas posibles? (para mostrar "Prefiero recibir todo junto"). */
export function isMixedCart(plan: CartPlan): boolean {
  const sources = new Set(plan.items.map((i) => i.source));
  return sources.has("LOCAL") && sources.has("ENCARGO");
}
