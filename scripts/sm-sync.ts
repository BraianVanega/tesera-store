/**
 * Sync manual con SexShopMayorista (docs/04). Usa SM_API_KEY de .env.local.
 *
 *   pnpm sm:sync                       # stock
 *   pnpm sm:sync products [--full] [--images]
 *   pnpm sm:sync quote --cp 1824 [--sku ABC123 --qty 1]   # prueba de cotización (no guarda nada)
 *   pnpm sm:sync provinces
 *
 * Nunca crea pedidos en SM. Logs sin PII. La cache de la tienda se refresca sola en minutos
 * (o en el próximo cron, que invalida el tag "catalog").
 */
import { parseArgs } from "node:util";
import { z } from "zod";
import { createSmClient } from "../src/lib/sm/client";
import { integrationLogger } from "../src/lib/sm/log";
import { buildQuoteRequest, mapQuote } from "../src/lib/sm/quote";
import { syncProducts, syncStock } from "../src/lib/sm/sync";
import { downloadImage, uploadPublicImage } from "../src/lib/storage/blob";
import { scriptDb } from "./lib/db";

const { values: args, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    full: { type: "boolean", default: false },
    images: { type: "boolean", default: false },
    cp: { type: "string" },
    sku: { type: "string" },
    qty: { type: "string", default: "1" },
  },
});

async function main() {
  const command = positionals[0] ?? "stock";
  const apiKey = z.string().startsWith("sm_").safeParse(process.env.SM_API_KEY);
  if (!apiKey.success) {
    console.error("Falta SM_API_KEY (empieza con sm_) en .env.local");
    process.exit(1);
  }
  const db = scriptDb();
  const log = integrationLogger(db);
  const client = createSmClient({
    apiKey: apiKey.data,
    baseUrl: process.env.SM_API_BASE_URL || undefined,
    log,
  });

  try {
    if (command === "stock") {
      console.log(await syncStock({ db, client, log }));
    } else if (command === "products") {
      const token = process.env.BLOB_READ_WRITE_TOKEN;
      if (args.images && !token) throw new Error("Falta BLOB_READ_WRITE_TOKEN para --images");
      const images =
        args.images && token
          ? {
              download: downloadImage,
              upload: (path: string, body: ArrayBuffer, type: string) =>
                uploadPublicImage(path, body, type, token),
            }
          : undefined;
      console.log(
        await syncProducts({ db, client, log, images }, args.full ? "full" : "incremental"),
      );
    } else if (command === "quote") {
      if (!args.cp) throw new Error("Uso: pnpm sm:sync quote --cp 1824 [--sku X --qty 1]");
      const items = args.sku ? [{ sku: args.sku, cantidad: Number(args.qty) }] : [];
      const data = await client.quote(buildQuoteRequest({ cp: args.cp, items }));
      console.log(mapQuote(args.cp, data, "checkout"));
    } else if (command === "provinces") {
      console.log((await client.provinces()).items);
    } else {
      throw new Error(`Comando desconocido: ${command}`);
    }
    console.log("Cupo:", client.rateState());
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
