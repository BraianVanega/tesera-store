/**
 * Importa productos de SM como BORRADORES (docs/04, Fase 2).
 *
 *   pnpm catalog:import --file ruta/products.json [--images] [--dry-run]
 *
 * Entrada: el JSON de `GET /api/v1/products` de SM (una página `{ok,data:{items}}`, un array de
 * páginas o un array de productos). Cuando exista el cliente de la Fase 3, el sync lo llama directo.
 *
 * - Producto nuevo → Product borrador (sin publicar, sin categoría) + ofertas DROPSHIP y STOCK.
 * - Producto ya importado (por SKU) → solo actualiza ofertas y fotos; no pisa lo curado.
 * - --images: descarga cada foto UNA vez y la sube a Vercel Blob (BLOB_READ_WRITE_TOKEN).
 * - Logs sin PII (no hay PII en el catálogo, igual solo se registran conteos).
 */
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { z } from "zod";
import { syncImages } from "../src/lib/catalog/images";
import { mapSmProduct, slugify, type OfferData } from "../src/lib/catalog/import";
import { smProductSchema, type SmProduct } from "../src/lib/sm/schemas";
import { downloadImage, uploadPublicImage } from "../src/lib/storage/blob";
import { scriptDb } from "./lib/db";

const { values: args } = parseArgs({
  options: {
    file: { type: "string" },
    images: { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
  },
});

function readProducts(path: string): { products: SmProduct[]; invalid: string[] } {
  const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
  const pages = Array.isArray(raw) ? raw : [raw];
  const items: unknown[] = pages.flatMap((p) =>
    p && typeof p === "object" && "data" in p
      ? ((p as { data?: { items?: unknown[] } }).data?.items ?? [])
      : [p],
  );
  const products: SmProduct[] = [];
  const invalid: string[] = [];
  for (const item of items) {
    const r = smProductSchema.safeParse(item);
    if (r.success) products.push(r.data);
    else invalid.push(String((item as { sku?: unknown })?.sku ?? "¿sin sku?"));
  }
  return { products, invalid };
}

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

async function main() {
  if (!args.file) {
    console.error("Uso: pnpm catalog:import --file products.json [--images] [--dry-run]");
    process.exit(1);
  }
  const { products, invalid } = readProducts(args.file);
  console.log(`Leídos ${products.length} productos válidos, ${invalid.length} inválidos.`);
  if (invalid.length) console.log(`SKUs inválidos (revisar schema): ${invalid.join(", ")}`);
  if (args["dry-run"]) return;

  const blobToken = args.images
    ? z
        .string()
        .min(1)
        .parse(process.env.BLOB_READ_WRITE_TOKEN, {
          error: () => "Falta BLOB_READ_WRITE_TOKEN para subir fotos",
        })
    : null;

  const db = scriptDb();
  const now = new Date();
  const stats = { created: 0, updated: 0, images: 0, imageErrors: 0 };

  try {
    for (const p of products) {
      const existing = await db.supplierOffer.findUnique({
        where: {
          supplier_supplierSku_mode: {
            supplier: "SM",
            supplierSku: p.sku.trim(),
            mode: "DROPSHIP",
          },
        },
        select: { productId: true },
      });

      const takenSlugs = new Set(
        (
          await db.product.findMany({
            where: { slug: { startsWith: slugify(p.nombre) || slugify(p.sku) } },
            select: { slug: true },
          })
        ).map((r) => r.slug),
      );
      const mapped = mapSmProduct(p, { now, slugTaken: (s) => takenSlugs.has(s) });

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
      if (existing) stats.updated++;
      else stats.created++;

      if (blobToken && mapped.images.length) {
        const have = await db.productImage.findMany({
          where: { productId, sourceUrl: { not: null } },
          select: { sourceUrl: true },
        });
        const r = await syncImages(
          mapped.images,
          have.map((h) => h.sourceUrl!),
          {
            download: downloadImage,
            upload: (path, body, type) => uploadPublicImage(path, body, type, blobToken),
          },
        );
        if (r.stored.length) {
          await db.productImage.createMany({
            data: r.stored.map((s) => ({ productId, ...s })),
            skipDuplicates: true,
          });
        }
        stats.images += r.stored.length;
        stats.imageErrors += r.failed.length;
      }
    }

    await db.integrationLog.create({
      data: {
        service: "SM",
        action: "import-catalog",
        ok: invalid.length === 0 && stats.imageErrors === 0,
        message: `creados=${stats.created} actualizados=${stats.updated} invalidos=${invalid.length} fotos=${stats.images} fotosConError=${stats.imageErrors}`,
      },
    });
    console.log(
      `Listo: ${stats.created} borradores nuevos, ${stats.updated} actualizados, ${stats.images} fotos subidas, ${stats.imageErrors} fotos con error.`,
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
