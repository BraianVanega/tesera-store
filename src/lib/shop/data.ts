import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { cookies } from "next/headers";
import { getPublishedBySlug, listPublished, listPublishedByIds } from "../catalog/queries";
import { db } from "../db";
import { COOKIES, parseCart, parseZone } from "./session";

/**
 * Lecturas de la tienda. El catálogo se cachea unos minutos (tag "catalog"; el sync de SM y el
 * panel lo invalidan); el carrito lee siempre fresco. Las cookies se leen dentro de <Suspense>.
 */

export async function getCatalog(category?: string) {
  "use cache";
  cacheLife("minutes");
  cacheTag("catalog");
  return listPublished(db(), category ? { category } : {});
}

export async function getCatalogProduct(slug: string) {
  "use cache";
  cacheLife("minutes");
  cacheTag("catalog");
  return getPublishedBySlug(db(), slug);
}

export async function getCartProducts(ids: string[]) {
  return listPublishedByIds(db(), ids);
}

export async function readZone() {
  return parseZone((await cookies()).get(COOKIES.zone)?.value);
}

export async function readCart() {
  return parseCart((await cookies()).get(COOKIES.cart)?.value);
}
