import "server-only";
import { cacheLife } from "next/cache";
import { db } from "../db";
import { smClient, smQuoter } from "../sm/server";
import { buildCheckout, needsQuote, type CheckoutPlan, type QuotedOption } from "./checkout";
import { getCartProducts, readCart, readZone } from "./data";

/** Lecturas del checkout (servidor). Leen cookies: siempre dentro de <Suspense> o de una action. */

export async function loadCheckout() {
  const [cart, zone] = await Promise.all([readCart(), readZone()]);
  if (!zone) return null;
  const products = await getCartProducts(cart.lines.map((l) => l.id));
  return { cart, zone, products, checkout: buildCheckout(cart, products, zone) };
}

export type CheckoutQuote = { quoteId: string | null; options: QuotedOption[]; agencyId?: string };

/**
 * Cotización de CHECKOUT (con calle y número, y sucursal si aplica): su `quoteId` es el que se
 * manda a SM al despachar (docs/04). Ítems = SKUs de SM de las líneas dropship.
 */
export async function quoteForCheckout(
  c: CheckoutPlan,
  addr: {
    street: string;
    number: string;
    locality: string;
    provinceId?: number;
    agencyId?: string;
  },
): Promise<CheckoutQuote | null> {
  if (!needsQuote(c)) return null;
  const quote = smQuoter();
  if (!quote) throw new Error("SM no está configurado");
  const offers = await db().supplierOffer.findMany({
    where: {
      productId: { in: c.lines.map((l) => l.productId) },
      supplier: "SM",
      mode: "DROPSHIP",
    },
    select: { productId: true, supplierSku: true },
  });
  const sku = new Map(offers.map((o) => [o.productId, o.supplierSku]));
  const items = c.lines.map((l) => ({ sku: sku.get(l.productId)!, cantidad: l.quantity }));
  if (items.some((i) => !i.sku)) throw new Error("Producto sin SKU de SM");

  const q = await quote(
    {
      cp: c.zone.cp,
      items,
      calle: addr.street,
      numero: addr.number,
      localidad: addr.locality,
      provinciaId: addr.provinceId,
      agencyId: addr.agencyId,
    },
    "checkout",
  );
  return {
    quoteId: q.quoteId,
    options: q.options.map((o) => ({
      code: o.code,
      label: o.label,
      toAgency: o.toAgency,
      price: o.price,
      minDays: o.minDays,
      maxDays: o.maxDays,
    })),
    agencyId: addr.agencyId,
  };
}

/** Provincias de SM (cambian muy poco: cache de días). Sin SM, lista vacía. */
export async function getProvinces(): Promise<{ id: number; name: string }[]> {
  "use cache";
  cacheLife("days");
  const c = smClient();
  if (!c) return [];
  try {
    const r = await c.provinces();
    return r.items
      .map((p) => ({ id: p.id, name: p.descripcion }))
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
  } catch {
    return [];
  }
}

export async function getAgencies(provinceId: number, cp: string) {
  const c = smClient();
  if (!c) return [];
  const r = await c.agencies(provinceId, cp);
  return r.items.map((a) => ({
    code: a.codigo,
    name: a.nombre,
    address: `${a.direccion}, ${a.localidad}`,
  }));
}
