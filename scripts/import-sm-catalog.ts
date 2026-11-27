/**
 * Importa productos de SM como BORRADORES (docs/04, Fase 2).
 *
 *   pnpm catalog:import --file ruta/products.json [--images] [--dry-run]
 *
 * Entrada: el JSON de `GET /api/v1/products` de SM (una página `{ok,data:{items}}`, un array de
 * páginas o un array de productos). Para traerlo de la API directo: `pnpm sm:sync products`.
 *
 * - Producto nuevo → Product borrador (sin publicar, sin categoría) + ofertas DROPSHIP y STOCK.
 * - Producto ya importado (por SKU) → solo actualiza ofertas y fotos; no pisa lo curado.
 * - --images: descarga cada foto UNA vez y la sube a Vercel Blob (BLOB_READ_WRITE_TOKEN).
 * - Logs sin PII (no hay PII en el catálogo, igual solo se registran conteos).
 */
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { z } from "zod";
import { upsertSmProduct } from "../src/lib/catalog/upsert";
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
    const images = blobToken
      ? {
          download: downloadImage,
          upload: (path: string, body: ArrayBuffer, type: string) =>
            uploadPublicImage(path, body, type, blobToken),
        }
      : undefined;
    for (const p of products) {
      const r = await upsertSmProduct(db, p, { now, images });
      if (r.created) stats.created++;
      else stats.updated++;
      stats.images += r.images;
      stats.imageErrors += r.imageErrors;
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
