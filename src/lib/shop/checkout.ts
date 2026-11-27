import { z } from "zod";
import type { CatalogProduct } from "../catalog/queries";
import { type CartPlan, isMixedCart, planCart } from "../domain/cart";
import { freeShippingStatus, listSubtotal, orderTotals, type OrderTotals } from "../domain/pricing";
import { courierCharge, quotedShippingChoices } from "../domain/shipping";
import type { Source } from "../domain/availability";
import { pluralize } from "./format";
import { type CartCookie, type ShopZone } from "./session";

/**
 * Checkout: arma el pedido a partir del carrito, la zona y (fuera de MdP) la cotización de SM.
 * Pura. La usan la página (para mostrar) y `createOrder` (para recalcular TODO en el servidor:
 * nunca se confía en precios ni envíos que vengan del navegador).
 */

export const COURIER_CODE = "cadete-mdp";

// ── Formulario ────────────────────────────────────────

const text = (max: number) => z.string().trim().max(max);
const required = (max: number, msg: string) => text(max).min(1, msg);

export const checkoutFormSchema = z.object({
  name: required(120, "Escribí tu nombre y apellido."),
  email: z.string().trim().toLowerCase().max(160).email("Revisá el email."),
  phone: text(30).regex(
    /^[\d\s()+-]{8,30}$/,
    "Revisá el teléfono: solo números, con característica.",
  ),
  locality: required(80, "Escribí la localidad."),
  provinceId: z.coerce.number().int().positive().optional(),
  province: required(60, "Elegí la provincia."),
  street: required(120, "Escribí la calle."),
  number: required(12, "Escribí el número (o «S/N»)."),
  floor: text(40).optional(),
  notes: text(200).optional(),
});
export type CheckoutForm = z.infer<typeof checkoutFormSchema>;

export const paymentMethodSchema = z.enum(["MP", "TRANSFER"]);
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

// ── Envío ─────────────────────────────────────────────

/** Opción de envío cotizada por SM (ver `sm/quote.ts`), sin importar el módulo de servidor. */
export type QuotedOption = {
  code: string;
  label: string;
  toAgency: boolean;
  price: number;
  minDays: number;
  maxDays: number;
};

export type ShippingChoice = {
  code: string;
  label: string;
  detail: string;
  /** Lo que paga el cliente. */
  charged: number;
  /** Lo que paga la tienda (SM o cadete). */
  cost: number;
  toAgency: boolean;
};

export type CheckoutLine = {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  source: Source;
};

export type CheckoutPlan = {
  zone: ShopZone;
  plan: CartPlan;
  lines: CheckoutLine[];
  subtotal: number;
  /** Productos del carrito que no entran en el pedido (no se venden en la zona). */
  leftOut: string[];
  twoBatches: boolean;
  freeShipping: boolean;
  choices: ShippingChoice[];
};

function days(min: number, max: number) {
  return min === max ? pluralize(min, "día hábil", "días hábiles") : `${min} a ${max} días hábiles`;
}

/** Nombre al cliente: se elige por `code` (el nombre de SM puede cambiar, docs/04). */
export function shippingLabel(code: string, fallback = "Envío a domicilio"): string {
  if (code === COURIER_CODE) return "Cadete en Mar del Plata";
  if (code === "moova-flex") return "Envío rápido a domicilio";
  if (code.endsWith("-suc")) return "Retiro en sucursal de Correo";
  if (code.startsWith("ca-ep")) return "Correo Expreso a domicilio";
  if (code.startsWith("ca-cp")) return "Correo a domicilio";
  return fallback;
}

function quotedLabel(o: QuotedOption): string {
  return shippingLabel(o.code, o.label);
}

export function buildCheckout(
  cart: CartCookie,
  products: CatalogProduct[],
  zone: ShopZone,
  quoted: QuotedOption[] = [],
): CheckoutPlan {
  const byId = new Map(products.map((p) => [p.id, p]));
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
  const checkoutLines = plan.items.map((i) => ({
    productId: i.productId,
    name: byId.get(i.productId)!.name,
    quantity: i.quantity,
    unitPrice: price(i.productId),
    source: i.source,
  }));
  const subtotal = listSubtotal(checkoutLines);
  const twoBatches = plan.batches.length > 1;

  let choices: ShippingChoice[] = [];
  let freeShipping = false;
  if (zone.zone === "MDP") {
    const c = courierCharge(plan, price);
    freeShipping = c.charged === 0;
    const detail = twoBatches
      ? "Dos entregas: hoy y cuando llegue el resto (5 a 10 días). Cada una es gratis desde $ 15.000."
      : plan.batches[0]?.key === "TODAY"
        ? "Llega hoy. Gratis desde $ 15.000."
        : "Llega en 5 a 10 días. Gratis desde $ 15.000.";
    choices = plan.items.length
      ? [
          {
            code: COURIER_CODE,
            label: "Cadete en Mar del Plata",
            detail,
            charged: c.charged,
            cost: c.cost,
            toAgency: false,
          },
        ]
      : [];
  } else {
    freeShipping = freeShippingStatus(subtotal, zone.zone, zone.cp).isFree;
    choices = quotedShippingChoices(quoted, freeShipping).map((o) => ({
      code: o.code,
      label: quotedLabel(o),
      detail: o.toAgency
        ? `Retirás con tu DNI. ${days(o.minDays, o.maxDays)}.`
        : `${days(o.minDays, o.maxDays)}.`,
      charged: o.charged,
      cost: o.cost,
      toAgency: o.toAgency,
    }));
  }

  return {
    zone,
    plan,
    lines: checkoutLines,
    subtotal,
    leftOut: plan.unavailable.map((u) => byId.get(u.productId)!.name),
    twoBatches,
    freeShipping,
    choices,
  };
}

/** ¿Falta cotizar con SM? (fuera de MdP, con productos). */
export function needsQuote(c: Pick<CheckoutPlan, "zone" | "lines">): boolean {
  return c.zone.zone !== "MDP" && c.lines.length > 0;
}

export type CheckoutTotals = OrderTotals & { shippingCost: number; choice: ShippingChoice };

/** Totales para una opción de envío y un medio de pago. `null` si la opción no existe. */
export function checkoutTotals(
  c: CheckoutPlan,
  shippingCode: string,
  method: PaymentMethod,
): CheckoutTotals | null {
  const choice = c.choices.find((o) => o.code === shippingCode);
  if (!choice || c.lines.length === 0) return null;
  const t = orderTotals({ lines: c.lines, paymentMethod: method, shippingCharged: choice.charged });
  return { ...t, shippingCost: choice.cost, choice };
}

/** Para la UI: líneas agrupadas por tanda (MdP) o una sola entrega. */
export function deliveryGroups(c: CheckoutPlan): { title: string; lines: string[] }[] {
  const byId = new Map(c.lines.map((l) => [l.productId, l.name]));
  return c.plan.batches.map((b, i) => ({
    title:
      c.zone.zone !== "MDP"
        ? "Tu envío"
        : c.twoBatches
          ? `Tanda ${i + 1} · ${b.key === "TODAY" ? "Hoy" : "Llega después"}`
          : b.key === "TODAY"
            ? "Llega hoy"
            : isMixedCart(c.plan)
              ? "Todo junto"
              : "Tu entrega",
    lines: b.items.map((it) => `${byId.get(it.productId)} × ${it.quantity}`),
  }));
}
