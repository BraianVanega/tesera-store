import { config, type Zone } from "../config";
import { freeShippingKey } from "./zone";

/** Único lugar donde se redondea dinero. Siempre pesos enteros. */
const round = (n: number) => Math.round(n);

/** Precio con transferencia = lista − 10 %. Se comunica como "10% OFF", nunca como recargo por tarjeta. */
export function transferPrice(listPrice: number, pct = config.transferDiscountPct): number {
  return round(listPrice * (1 - pct / 100));
}

/** Descuento en pesos sobre un subtotal a lista. */
export function transferDiscount(subtotalList: number, pct = config.transferDiscountPct): number {
  return subtotalList - transferPrice(subtotalList, pct);
}

export type DropshipLine = { listPrice: number; costoCliente: number; quantity: number };

/** Costo de un pedido dropship: Σ costoCliente×cant + cargo de acondicionamiento POR PEDIDO (el envío va aparte). */
export function dropshipOrderCost(
  lines: DropshipLine[],
  fee = config.smDropshipFeePerOrder,
): number {
  return lines.reduce((acc, l) => acc + l.costoCliente * l.quantity, 0) + fee;
}

/**
 * Margen de un pedido dropship (pesos) y su % sobre el subtotal de lista.
 * `mpFeePct`: comisión efectiva de MP que absorbe la tienda (el +5 % de la lista la cubre; ver docs/05).
 * No incluye envío absorbido ni el abono mensual.
 */
export function dropshipOrderMargin(lines: DropshipLine[], mpFeePct = 5) {
  const revenue = lines.reduce((acc, l) => acc + l.listPrice * l.quantity, 0);
  const cost = dropshipOrderCost(lines);
  const mpFee = round((revenue * mpFeePct) / 100);
  const margin = revenue - cost - mpFee;
  return { revenue, cost, mpFee, margin, marginPct: revenue > 0 ? (margin / revenue) * 100 : 0 };
}

export type CartLine = { unitPrice: number; quantity: number };

/** Subtotal a PRECIO DE LISTA (base del envío gratis y del descuento). */
export function listSubtotal(lines: CartLine[]): number {
  return lines.reduce((acc, l) => acc + l.unitPrice * l.quantity, 0);
}

export type ShippingQuote = {
  threshold: number | null;
  remaining: number | null; // cuánto falta para envío gratis (null si la zona no tiene)
  isFree: boolean;
};

/** Estado de la barra de envío gratis. El umbral se calcula sobre lista, antes del descuento. */
export function freeShippingStatus(subtotalList: number, zone: Zone, cp: string): ShippingQuote {
  const threshold = config.freeShipping[freeShippingKey(zone, cp)];
  if (threshold === null) return { threshold: null, remaining: null, isFree: false };
  return {
    threshold,
    remaining: Math.max(0, threshold - subtotalList),
    isFree: subtotalList >= threshold,
  };
}

export type OrderTotals = {
  subtotal: number;
  discount: number;
  shippingCharged: number;
  total: number;
};

/**
 * Totales del pedido. `shippingCharged` ya viene calculado (`domain/shipping.ts`): lo que paga el
 * cliente por el envío. El 10 % OFF de transferencia se aplica solo a los productos, nunca al envío.
 */
export function orderTotals(args: {
  lines: CartLine[];
  paymentMethod: "MP" | "TRANSFER";
  shippingCharged: number;
}): OrderTotals {
  const subtotal = listSubtotal(args.lines);
  const discount = args.paymentMethod === "TRANSFER" ? transferDiscount(subtotal) : 0;
  return {
    subtotal,
    discount,
    shippingCharged: args.shippingCharged,
    total: subtotal - discount + args.shippingCharged,
  };
}

/**
 * Prorratea un costo (ej. envío del pedido semanal) entre líneas, proporcional a su valor
 * (docs/12: "parte del envío prorrateada por valor"). Reparte por resto mayor para que la suma
 * dé exactamente `total` en pesos enteros. Si todas las líneas valen 0, reparte por cantidad.
 */
export function allocateByValue(
  lines: { value: number; quantity: number }[],
  total: number,
): number[] {
  if (lines.length === 0) return [];
  if (!Number.isInteger(total) || total < 0) throw new Error(`Total inválido: ${total}`);
  const totalValue = lines.reduce((a, l) => a + l.value, 0);
  const weights = totalValue > 0 ? lines.map((l) => l.value) : lines.map((l) => l.quantity);
  const weightSum = weights.reduce((a, w) => a + w, 0);
  if (weightSum <= 0) throw new Error("No hay base para prorratear");
  const exact = weights.map((w) => (total * w) / weightSum);
  const floors = exact.map(Math.floor);
  let rest = total - floors.reduce((a, f) => a + f, 0);
  const order = exact
    .map((e, i) => ({ i, frac: e - Math.floor(e) }))
    .sort((a, b) => b.frac - a.frac);
  for (const { i } of order) {
    if (rest === 0) break;
    floors[i] += 1;
    rest -= 1;
  }
  return floors;
}

/** Costo unitario de una línea de compra = costo neto + su parte del envío / cantidad. */
export function unitCostWithShipping(
  netUnitCost: number,
  shippingShare: number,
  quantity: number,
): number {
  if (!Number.isInteger(quantity) || quantity <= 0)
    throw new Error(`Cantidad inválida: ${quantity}`);
  return round(netUnitCost + shippingShare / quantity);
}

/** Pasa un monto con decimales (ej. `costoCliente: 18742.50` de SM) a pesos enteros. */
export function toPesos(amount: number): number {
  return round(amount);
}
