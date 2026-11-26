import type { CatalogProduct } from "../catalog/queries";
import { freeShippingBase, isMixedCart, planCart } from "../domain/cart";
import { freeShippingStatus, listSubtotal, transferDiscount } from "../domain/pricing";
import { formatMoney } from "./format";
import { type CartCookie, MAX_LINE_QTY, type ShopZone, zoneLabel } from "./session";

/**
 * Vista del carrito: arma tandas, unidades no disponibles, barra de envío gratis y totales a
 * partir del dominio (planCart, pricing). Pura: la página solo la renderiza.
 * Nunca dice "encargo": las tandas se nombran por plazo (docs/02).
 */

export type CartItemView = {
  product: CatalogProduct;
  /** Unidades de este producto en esta tanda. */
  quantity: number;
  /** Total pedido de la línea (lo que muestra y cambia el stepper). */
  lineQty: number;
  /** El stepper va en la primera aparición del producto; si se parte, la otra tanda solo informa. */
  showStepper: boolean;
  canAdd: boolean;
  lineTotal: string;
  unitPrice: string;
};

export type BatchView = {
  key: "TODAY" | "LATER";
  title: string;
  badge: { kind: "hoy" | "plazo" | "envio"; text: string };
  note?: string;
  items: CartItemView[];
};

export type CartView = {
  units: number;
  batches: BatchView[];
  unavailable: { product: CatalogProduct; quantity: number; partial: boolean }[];
  canDeliverTogether: boolean;
  together: boolean;
  freeShipping:
    | { kind: "bar"; text: string; note: string; base: number; threshold: number; pct: number }
    | { kind: "none"; text: string };
  subtotal: string;
  discount: string;
  totalTransfer: string;
  totalList: string;
  canCheckout: boolean;
};

const LATER_NOTE = "Lo pedimos esta semana y te avisamos cuando esté listo para entregar.";

export function buildCartView(
  cart: CartCookie,
  products: CatalogProduct[],
  zone: ShopZone,
): CartView {
  const byId = new Map(products.map((p) => [p.id, p]));
  // Lo que ya no está publicado se descarta en silencio.
  const lines = cart.lines.filter((l) => byId.has(l.id));
  const plan = planCart(
    lines.map((l) => ({
      productId: l.id,
      quantity: l.qty,
      product: byId.get(l.id)!.availabilityInput,
    })),
    zone.zone,
    { deliverTogether: cart.together },
  );
  const price = (id: string) => byId.get(id)!.price;
  const lineQty = new Map(lines.map((l) => [l.id, l.qty]));
  const seen = new Set<string>();
  const split = plan.batches.length > 1;

  const batches: BatchView[] = plan.batches.map((b, i) => {
    const items = b.items.map((it) => {
      const first = !seen.has(it.productId);
      seen.add(it.productId);
      const p = byId.get(it.productId)!;
      return {
        product: p,
        quantity: it.quantity,
        lineQty: lineQty.get(it.productId)!,
        showStepper: first,
        canAdd: lineQty.get(it.productId)! < MAX_LINE_QTY,
        lineTotal: formatMoney(p.price * it.quantity),
        unitPrice: formatMoney(p.price),
      };
    });
    if (zone.zone !== "MDP") {
      return { key: b.key, title: "Tu envío", badge: { kind: "envio", text: b.delivery }, items };
    }
    if (b.key === "TODAY") {
      return {
        key: b.key,
        title: split ? `Tanda ${i + 1} · Hoy` : "Llega hoy",
        badge: { kind: "hoy", text: "Entrega hoy con cadete" },
        items,
      };
    }
    const together = cart.together && isMixedCart(plan);
    return {
      key: b.key,
      title: split ? `Tanda ${i + 1} · Llega después` : together ? "Todo junto" : "Tu entrega",
      badge: { kind: "plazo", text: "5 a 10 días" },
      note: together
        ? `Recibís todo en una sola entrega, cuando llegue lo último. ${LATER_NOTE}`
        : LATER_NOTE,
      items,
    };
  });

  const unavailable = plan.unavailable.map((u) => ({
    product: byId.get(u.productId)!,
    quantity: u.quantity,
    partial: u.quantity < lineQty.get(u.productId)!,
  }));

  const sellable = plan.items.map((i) => ({ unitPrice: price(i.productId), quantity: i.quantity }));
  const subtotal = listSubtotal(sellable);
  const discount = transferDiscount(subtotal);

  return {
    units: lines.reduce((a, l) => a + l.qty, 0),
    batches,
    unavailable,
    canDeliverTogether: isMixedCart(plan),
    together: cart.together,
    freeShipping: freeShippingView(freeShippingBase(plan, price), zone, split),
    subtotal: formatMoney(subtotal),
    discount: formatMoney(discount),
    totalTransfer: formatMoney(subtotal - discount),
    totalList: formatMoney(subtotal),
    canCheckout: plan.items.length > 0,
  };
}

function freeShippingView(base: number, zone: ShopZone, split: boolean): CartView["freeShipping"] {
  const s = freeShippingStatus(base, zone.zone, zone.cp);
  if (s.threshold === null) {
    return {
      kind: "none",
      text: `Al ${zoneLabel(zone).toLowerCase()} pagás el costo cotizado del envío. Lo ves antes de pagar.`,
    };
  }
  const where = zone.zone === "MDP" ? "en Mar del Plata" : `en ${zoneLabel(zone)}`;
  const scope = split ? " para la entrega de hoy" : "";
  return {
    kind: "bar",
    text: s.isFree
      ? `¡Listo! Tu ${split ? "entrega de hoy" : "pedido"} tiene envío gratis`
      : `Te faltan ${formatMoney(s.remaining!)} para el envío gratis${scope}`,
    note: `Envío gratis desde ${formatMoney(s.threshold)} ${where}${split ? " con stock local" : ""}. Se calcula sobre el precio de lista.`,
    base: Math.min(base, s.threshold),
    threshold: s.threshold,
    pct: Math.min(100, Math.round((base / s.threshold) * 100)),
  };
}
