import type { PrismaClient } from "@prisma/client";
import type { SmProduct } from "../sm/schemas";
import { syncImages, type ImageDeps } from "./images";
import { mapSmProduct, slugify, type OfferData } from "./import";

/**
 * Upsert de un producto de SM (lo usan `pnpm catalog:import` y el sync de la Fase 3).
 * - Nuevo → Product BORRADOR + ofertas DROPSHIP y STOCK.
 * - Existente (por SKU) → solo ofertas y fotos; nunca pisa lo curado (nombre, precio, categoría).
 */

const offerFields = (o: OfferData) => ({
  cost: o.cost,
  stock: o.stock,
  stockState: o.stockState,
  suggested: o.suggested,
  campaign: o.campaign ?? undefined,
  weightGr: o.weightGr,
  dimensions: o.dimensions ?? undefined,
  vatPct: o.vatPct,
  syncedAt: o.syncedAt,
});

export type UpsertResult = {
  created: boolean;
  productId: string;
  images: number;
  imageErrors: number;
};

export async function upsertSmProduct(
  db: PrismaClient,
  p: SmProduct,
  opts: { now: Date; images?: ImageDeps },
): Promise<UpsertResult> {
  const existing = await db.supplierOffer.findUnique({
    where: {
      supplier_supplierSku_mode: { supplier: "SM", supplierSku: p.sku.trim(), mode: "DROPSHIP" },
    },
    select: { productId: true },
  });

  let slugTaken: (s: string) => boolean = () => false;
  if (!existing) {
    const taken = new Set(
      (
        await db.product.findMany({
          where: { slug: { startsWith: slugify(p.nombre) || slugify(p.sku) } },
          select: { slug: true },
        })
      ).map((r) => r.slug),
    );
    slugTaken = (s) => taken.has(s);
  }
  const mapped = mapSmProduct(p, { now: opts.now, slugTaken });

  const productId = await db.$transaction(async (tx) => {
    const id =
      existing?.productId ??
      (await tx.product.create({ data: mapped.draft, select: { id: true } })).id;
    for (const o of mapped.offers) {
      await tx.supplierOffer.upsert({
        where: {
          supplier_supplierSku_mode: {
            supplier: o.supplier,
            supplierSku: o.supplierSku,
            mode: o.mode,
          },
        },
        create: {
          productId: id,
          supplier: o.supplier,
          supplierSku: o.supplierSku,
          mode: o.mode,
          ...offerFields(o),
        },
        update: offerFields(o),
      });
    }
    return id;
  });

  let images = 0;
  let imageErrors = 0;
  if (opts.images && mapped.images.length) {
    const have = await db.productImage.findMany({
      where: { productId, sourceUrl: { not: null } },
      select: { sourceUrl: true },
    });
    const r = await syncImages(
      mapped.images,
      have.map((h) => h.sourceUrl!),
      opts.images,
    );
    if (r.stored.length) {
      await db.productImage.createMany({
        data: r.stored.map((s) => ({ productId, ...s })),
        skipDuplicates: true,
      });
    }
    images = r.stored.length;
    imageErrors = r.failed.length;
  }

  return { created: !existing, productId, images, imageErrors };
}
