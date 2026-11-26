import { toPesos } from "../domain/pricing";
import type { SmProduct } from "../sm/schemas";
import { UNCATEGORIZED } from "./categories";

/**
 * Mapeo puro de un producto de SM a nuestro modelo (docs/04 "Mapeo a nuestro modelo").
 *
 * - Catálogo curado (Product) y datos del proveedor (SupplierOffer) van separados.
 * - Un producto nuevo entra como BORRADOR (published=false, sin categoría): Brai/Eric eligen
 *   cuáles publicar, les ponen categoría, precio y si es consumible.
 * - Un producto existente solo actualiza ofertas y fotos: nunca pisa lo curado.
 */

export type OfferData = {
  supplier: "SM";
  supplierSku: string;
  mode: "DROPSHIP" | "STOCK";
  cost: number;
  stock: number;
  stockState: string;
  suggested: number;
  campaign: { nombre: string; descuentoPct: number; hasta: string } | null;
  weightGr: number | null;
  dimensions: { largo: number; ancho: number; alto: number } | null;
  vatPct: number | null;
  syncedAt: Date;
};

export type ProductDraft = {
  slug: string;
  name: string;
  /**
   * TODO(brai): `price` = costo + margen + 5 % MP (docs/04), pero el margen no está definido.
   * Mientras tanto el borrador toma el precio sugerido de SM como referencia y no se publica.
   */
  price: number;
  category: string;
  brand: string | null;
  isConsumable: boolean;
  published: false;
};

export type MappedProduct = {
  draft: ProductDraft;
  /** Misma lista de SM para dropship y para stock por mayor (confirmado por SM, docs/04). */
  offers: OfferData[];
  /** URLs de fotos ordenadas (orden 1 = principal). */
  images: { sourceUrl: string; position: number }[];
};

/** "Vibrador Nocturno Ñandú 3.0" → "vibrador-nocturno-nandu-3-0" */
export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

/** Slug libre: si ya existe, le agrega el SKU. */
export function uniqueSlug(base: string, sku: string, taken: (slug: string) => boolean): string {
  const first = slugify(base) || slugify(sku);
  if (!taken(first)) return first;
  const withSku = `${first}-${slugify(sku)}`;
  if (!taken(withSku)) return withSku;
  for (let i = 2; ; i++) {
    const candidate = `${withSku}-${i}`;
    if (!taken(candidate)) return candidate;
  }
}

export function mapSmProduct(
  p: SmProduct,
  opts: { now: Date; slugTaken?: (slug: string) => boolean },
): MappedProduct {
  const sku = p.sku.trim();
  const base = {
    supplier: "SM" as const,
    supplierSku: sku,
    cost: toPesos(p.costoCliente),
    stock: p.stock,
    stockState: p.estado,
    suggested: toPesos(p.precioSugeridoPublico),
    campaign: p.campania ?? null,
    weightGr: p.pesoGramos == null ? null : Math.trunc(p.pesoGramos),
    dimensions: p.dimensionesCm ?? null,
    vatPct: p.iva ?? null,
    syncedAt: opts.now,
  };
  return {
    draft: {
      slug: uniqueSlug(p.nombre, sku, opts.slugTaken ?? (() => false)),
      name: p.nombre.trim(),
      price: toPesos(p.precioSugeridoPublico),
      category: UNCATEGORIZED,
      brand: p.marca?.trim() || null,
      isConsumable: false,
      published: false,
    },
    offers: [
      { ...base, mode: "DROPSHIP" },
      { ...base, mode: "STOCK" },
    ],
    images: [...p.imagenes]
      .sort((a, b) => a.orden - b.orden)
      .map((img, i) => ({ sourceUrl: img.url, position: i + 1 })),
  };
}
