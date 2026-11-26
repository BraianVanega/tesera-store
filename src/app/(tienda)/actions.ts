"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import { getCartProducts, readCart } from "@/lib/shop/data";
import {
  COOKIES,
  COOKIE_MAX_AGE,
  type CartCookie,
  changeQty,
  normalizeCp,
  serializeCart,
  serializeZone,
  setQty,
  zoneFromCp,
} from "@/lib/shop/session";

/**
 * Acciones de la tienda: solo guardan estado en cookies propias. Todo input pasa por Zod.
 * Nada de logs con el contenido del carrito (docs/07).
 */

const cookieOptions = {
  path: "/",
  maxAge: COOKIE_MAX_AGE,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  httpOnly: false, // "Salir ya" las borra desde el cliente
};

async function saveCart(cart: CartCookie) {
  (await cookies()).set(COOKIES.cart, serializeCart(cart), cookieOptions);
}

export type ZoneState = { error?: string; ok?: boolean };

export async function setZoneAction(_prev: ZoneState, form: FormData): Promise<ZoneState> {
  const raw = z.string().max(12).safeParse(form.get("cp"));
  const cp = raw.success ? normalizeCp(raw.data) : null;
  if (!cp) return { error: "Revisá el código postal: son 4 números, por ejemplo 7600." };
  (await cookies()).set(COOKIES.zone, serializeZone(zoneFromCp(cp)), cookieOptions);
  return { ok: true };
}

const productId = z.string().min(1).max(40);

export type AddState = { added?: boolean; error?: string };

export async function addToCartAction(_prev: AddState, form: FormData): Promise<AddState> {
  const parsed = z
    .object({ productId, qty: z.coerce.number().int().min(1).max(20).default(1) })
    .safeParse({ productId: form.get("productId"), qty: form.get("qty") ?? undefined });
  if (!parsed.success) return { error: "No pudimos agregarlo. Probá de nuevo." };
  const [exists] = await getCartProducts([parsed.data.productId]);
  if (!exists) return { error: "Este producto ya no está disponible." };
  await saveCart(changeQty(await readCart(), parsed.data.productId, parsed.data.qty));
  return { added: true };
}

export async function changeQtyAction(form: FormData): Promise<void> {
  const parsed = z
    .object({ productId, delta: z.coerce.number().int().min(-20).max(20) })
    .safeParse({ productId: form.get("productId"), delta: form.get("delta") });
  if (!parsed.success) return;
  await saveCart(changeQty(await readCart(), parsed.data.productId, parsed.data.delta));
}

export async function removeLineAction(form: FormData): Promise<void> {
  const parsed = productId.safeParse(form.get("productId"));
  if (!parsed.success) return;
  await saveCart(setQty(await readCart(), parsed.data, 0));
}

export async function setTogetherAction(form: FormData): Promise<void> {
  const together = form.get("together") === "1";
  await saveCart({ ...(await readCart()), together });
}
