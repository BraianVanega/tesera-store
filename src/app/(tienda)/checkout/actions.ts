"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { CheckoutError, createOrder } from "@/lib/orders/create";
import { mercadoPago, transfer } from "@/lib/payments/server";
import {
  buildCheckout,
  checkoutFormSchema,
  checkoutTotals,
  type CheckoutForm,
  type CheckoutPlan,
  paymentMethodSchema,
} from "@/lib/shop/checkout";
import { getAgencies, loadCheckout, quoteForCheckout } from "@/lib/shop/checkout-server";
import { COOKIES } from "@/lib/shop/constants";
import { formatMoney } from "@/lib/shop/format";

/**
 * Acciones del checkout. Todo se valida y recalcula en el servidor: del navegador solo llegan los
 * datos de entrega, la opción de envío (`code`), la sucursal y el medio de pago.
 * Nunca se loguean datos personales.
 */

export type FieldErrors = Partial<Record<keyof CheckoutForm, string>>;

export type ChoiceView = {
  code: string;
  label: string;
  detail: string;
  toAgency: boolean;
  charged: string;
  free: boolean;
  totalMp: string;
  totalTransfer: string;
  discount: string;
};

export type ShippingResult =
  | { ok: true; choices: ChoiceView[]; leftOut: string[]; subtotal: string }
  | { ok: false; errors?: FieldErrors; error?: string };

function readForm(form: FormData) {
  const get = (k: string) => {
    const v = form.get(k);
    return typeof v === "string" ? v : undefined;
  };
  const parsed = checkoutFormSchema.safeParse({
    name: get("name"),
    email: get("email"),
    phone: get("phone"),
    locality: get("locality"),
    provinceId: get("provinceId") || undefined,
    province: get("province"),
    street: get("street"),
    number: get("number"),
    floor: get("floor") || undefined,
    notes: get("notes") || undefined,
  });
  if (parsed.success) return { ok: true as const, data: parsed.data };
  const errors: FieldErrors = {};
  for (const i of parsed.error.issues) {
    const k = i.path[0] as keyof CheckoutForm;
    errors[k] ??= i.message;
  }
  return { ok: false as const, errors };
}

const agencyField = z.string().trim().max(20).optional();

function views(c: CheckoutPlan): ChoiceView[] {
  return c.choices.map((ch) => {
    const mp = checkoutTotals(c, ch.code, "MP")!;
    const tr = checkoutTotals(c, ch.code, "TRANSFER")!;
    return {
      code: ch.code,
      label: ch.label,
      detail: ch.detail,
      toAgency: ch.toAgency,
      charged: ch.charged === 0 ? "Gratis" : formatMoney(ch.charged),
      free: ch.charged === 0,
      totalMp: formatMoney(mp.total),
      totalTransfer: formatMoney(tr.total),
      discount: formatMoney(tr.discount),
    };
  });
}

/** Paso "Envío": valida los datos y devuelve opciones reales (cadete o cotización de SM). */
export async function shippingOptionsAction(form: FormData): Promise<ShippingResult> {
  const f = readForm(form);
  if (!f.ok) return { ok: false, errors: f.errors };
  const loaded = await loadCheckout();
  if (!loaded || loaded.checkout.lines.length === 0) {
    return { ok: false, error: "Tu pedido está vacío o no tiene productos para tu zona." };
  }
  let checkout = loaded.checkout;
  try {
    const q = await quoteForCheckout(checkout, {
      street: f.data.street,
      number: f.data.number,
      locality: f.data.locality,
      provinceId: f.data.provinceId,
      agencyId: agencyField.parse(form.get("agencyId") || undefined),
    });
    if (q) checkout = buildCheckout(loaded.cart, loaded.products, loaded.zone, q.options);
  } catch {
    return {
      ok: false,
      error: "No pudimos cotizar el envío en este momento. Probá de nuevo en unos minutos.",
    };
  }
  if (checkout.choices.length === 0) {
    return { ok: false, error: "No hay envíos disponibles para esa dirección." };
  }
  return {
    ok: true,
    choices: views(checkout),
    leftOut: checkout.leftOut,
    subtotal: formatMoney(checkout.subtotal),
  };
}

export type AgencyView = { code: string; name: string; address: string };

export async function agenciesAction(provinceId: number): Promise<AgencyView[]> {
  const id = z.number().int().positive().safeParse(provinceId);
  const loaded = await loadCheckout();
  if (!id.success || !loaded) return [];
  try {
    return await getAgencies(id.data, loaded.zone.cp);
  } catch {
    return [];
  }
}

export type PlaceState = { error?: string; errors?: FieldErrors };

/** Confirmar: crea el pedido, vacía el carrito y manda a MP o a la página de transferencia. */
export async function placeOrderAction(_prev: PlaceState, form: FormData): Promise<PlaceState> {
  const f = readForm(form);
  if (!f.ok) return { errors: f.errors, error: "Revisá tus datos." };
  const method = paymentMethodSchema.safeParse(form.get("method"));
  const shippingCode = z.string().trim().min(1).max(40).safeParse(form.get("shippingCode"));
  const agencyId = agencyField.safeParse(form.get("agencyId") || undefined);
  if (!method.success) return { error: "Elegí cómo pagar." };
  if (!shippingCode.success || !agencyId.success) return { error: "Elegí una opción de envío." };

  const loaded = await loadCheckout();
  if (!loaded) redirect("/carrito");

  let target: string;
  try {
    const quote = await quoteForCheckout(loaded.checkout, {
      street: f.data.street,
      number: f.data.number,
      locality: f.data.locality,
      provinceId: f.data.provinceId,
      agencyId: agencyId.data,
    });
    const order = await createOrder(db(), {
      cart: loaded.cart,
      zone: loaded.zone,
      form: f.data,
      method: method.data,
      shippingCode: shippingCode.data,
      quote: quote ?? undefined,
    });
    // El pedido ya existe: el carrito se vacía aunque MP falle (desde el pedido se reintenta).
    (await cookies()).delete(COOKIES.cart);
    const provider = method.data === "MP" ? mercadoPago : transfer;
    try {
      target = (await provider.start(order)).url;
    } catch {
      target = (await transfer.start(order)).url; // misma página del pedido, con "reintentar pago"
    }
  } catch (e) {
    if (e instanceof CheckoutError) return { error: e.message };
    return { error: "No pudimos crear tu pedido. Probá de nuevo en un momento." };
  }
  redirect(target);
}
