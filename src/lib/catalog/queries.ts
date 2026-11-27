import type { Prisma, PrismaClient } from "@prisma/client";
import type { ProductLike } from "../domain/availability";
import { availableQuantity } from "../domain/inventory";
import { isCategory, silhouetteFor } from "./categories";

/**
 * Lectura del catálogo publicado. La tienda (Fase 4) solo renderiza esto + availability().
 * Reciben el cliente de Prisma por parámetro: en la app es `db()`, en scripts uno propio.
 */

const catalogInclude = {
  images: { orderBy: { position: "asc" } },
  offers: true,
  localStock: true,
} satisfies Prisma.ProductInclude;

type ProductRow = Prisma.ProductGetPayload<{ include: typeof catalogInclude }>;

export type CatalogProduct = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  price: number;
  category: string;
  brand: string | null;
  images: { url: string; position: number }[];
  /** Forma CSS a mostrar si no hay fotos (docs/02). */
  silhouette: string;
  /** Entrada para availability(); nunca decidir disponibilidad en la UI. */
  availabilityInput: ProductLike;
  /** SM avisa "bajo_stock" → la UI muestra "Últimas unidades" (docs/04). Nunca la cantidad. */
  lowStock: boolean;
};

/** Pura: fila de la base → producto de catálogo. */
export function toCatalogProduct(row: ProductRow): CatalogProduct {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    price: row.price,
    category: row.category,
    brand: row.brand,
    images: row.images.map((i) => ({ url: i.url, position: i.position })),
    silhouette: silhouetteFor(row.category),
    availabilityInput: {
      isConsumable: row.isConsumable,
      localQuantity: row.localStock ? availableQuantity(row.localStock) : 0,
      offers: row.offers.map((o) => ({ supplier: o.supplier, mode: o.mode, stock: o.stock })),
    },
    lowStock: row.offers.some((o) => o.mode === "DROPSHIP" && o.stockState === "bajo_stock"),
  };
}

export async function listPublished(
  db: PrismaClient,
  opts: { category?: string } = {},
): Promise<CatalogProduct[]> {
  if (opts.category !== undefined && !isCategory(opts.category)) return [];
  const rows = await db.product.findMany({
    where: { published: true, ...(opts.category ? { category: opts.category } : {}) },
    include: catalogInclude,
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
  });
  return rows.map(toCatalogProduct);
}

export async function getPublishedBySlug(
  db: PrismaClient,
  slug: string,
): Promise<CatalogProduct | null> {
  const row = await db.product.findFirst({
    where: { slug, published: true },
    include: catalogInclude,
  });
  return row ? toCatalogProduct(row) : null;
}

/** Productos publicados por id, SIN cache: el carrito necesita el stock fresco. */
export async function listPublishedByIds(
  db: PrismaClient,
  ids: string[],
): Promise<CatalogProduct[]> {
  if (ids.length === 0) return [];
  const rows = await db.product.findMany({
    where: { id: { in: ids }, published: true },
    include: catalogInclude,
  });
  return rows.map(toCatalogProduct);
}
