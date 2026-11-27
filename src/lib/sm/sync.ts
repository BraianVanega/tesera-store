import type { PrismaClient } from "@prisma/client";
import type { ImageDeps } from "../catalog/images";
import { upsertSmProduct } from "../catalog/upsert";

import type { SmClient, SmLogEntry } from "./client";
import type { SmProduct, SmStockItem } from "./schemas";

/**
 * Sync de catálogo y stock con SM (docs/04 "Sincronización").
 *
 * - Nunca borra: si SM falla a mitad de camino, lo ya actualizado queda y el resto conserva su
 *   `syncedAt` viejo (pasado `config.sm.staleHours` la tienda lo trata como sin stock).
 * - Productos nuevos entran como borrador; lo curado no se pisa (`upsertSmProduct`).
 * - Incremental: `/products/modificados?desde=` con la `ultimaActualizacion` más alta vista,
 *   guardada en SyncState. El cursor solo avanza si la corrida terminó completa.
 * - Invalidar la cache del catálogo lo hace quien llama (el cron), no este módulo.
 */

export const PRODUCTS_CURSOR = "sm.products.since";

type Log = (e: SmLogEntry) => Promise<void> | void;

export type SyncDeps = {
  db: PrismaClient;
  client: Pick<SmClient, "productsPage" | "modifiedPage" | "stockPage">;
  log: Log;
  now?: Date;
  images?: ImageDeps;
};

export type ProductSyncStats = {
  mode: "full" | "incremental";
  pages: number;
  seen: number;
  created: number;
  updated: number;
  failed: number;
  images: number;
  imageErrors: number;
  complete: boolean;
  error?: string;
};

type Page<T> = { totalPaginas: number; items: T[] };

/** Recorre todas las páginas; corta en la primera vacía o al pasar `totalPaginas`. */
async function* pages<T>(fetchPage: (page: number) => Promise<Page<T>>) {
  for (let page = 1; ; page++) {
    const data = await fetchPage(page);
    if (data.items.length === 0) return;
    yield data.items;
    if (page >= data.totalPaginas) return;
  }
}

/** `ultimaActualizacion` más alta (mismo formato ISO sin zona → la comparación de strings sirve). */
export function maxUpdatedAt(current: string | null, items: SmProduct[]): string | null {
  let max = current;
  for (const p of items) {
    const u = p.ultimaActualizacion;
    if (u && (!max || u > max)) max = u;
  }
  return max;
}

export async function syncProducts(
  deps: SyncDeps,
  mode: "full" | "incremental",
): Promise<ProductSyncStats> {
  const { db, client, log } = deps;
  const now = deps.now ?? new Date();
  const cursor = await db.syncState.findUnique({ where: { key: PRODUCTS_CURSOR } });
  // Sin cursor no hay incremental posible: primera vez = completo.
  const effective = mode === "incremental" && cursor ? "incremental" : "full";
  const stats: ProductSyncStats = {
    mode: effective,
    pages: 0,
    seen: 0,
    created: 0,
    updated: 0,
    failed: 0,
    images: 0,
    imageErrors: 0,
    complete: false,
  };
  let max = cursor?.value ?? null;

  const fetchPage =
    effective === "incremental"
      ? (page: number) => client.modifiedPage(cursor!.value, page)
      : (page: number) => client.productsPage(page);

  try {
    for await (const items of pages(fetchPage)) {
      stats.pages++;
      for (const p of items) {
        stats.seen++;
        try {
          const r = await upsertSmProduct(db, p, { now, images: deps.images });
          if (r.created) stats.created++;
          else stats.updated++;
          stats.images += r.images;
          stats.imageErrors += r.imageErrors;
        } catch {
          stats.failed++;
        }
      }
      max = maxUpdatedAt(max, items);
    }
    stats.complete = true;
  } catch (e) {
    stats.error = e instanceof Error ? e.message : String(e);
  }

  if (stats.complete && max && max !== cursor?.value) {
    await db.syncState.upsert({
      where: { key: PRODUCTS_CURSOR },
      create: { key: PRODUCTS_CURSOR, value: max },
      update: { value: max },
    });
  }

  await log({
    action: `sync.products.${effective}`,
    ok: stats.complete && stats.failed === 0,
    message:
      `paginas=${stats.pages} vistos=${stats.seen} nuevos=${stats.created} actualizados=${stats.updated} ` +
      `fallidos=${stats.failed} fotos=${stats.images} fotosConError=${stats.imageErrors}` +
      (stats.error ? ` error=${stats.error}` : ""),
  });
  return stats;
}

export type StockSyncStats = {
  pages: number;
  seen: number;
  updated: number;
  unknown: number;
  complete: boolean;
  error?: string;
};

export async function syncStock(deps: Omit<SyncDeps, "images">): Promise<StockSyncStats> {
  const { db, client, log } = deps;
  const now = deps.now ?? new Date();
  const stats: StockSyncStats = { pages: 0, seen: 0, updated: 0, unknown: 0, complete: false };

  try {
    for await (const items of pages<SmStockItem>((page) => client.stockPage(page))) {
      stats.pages++;
      stats.seen += items.length;
      const results = await db.$transaction(
        items.map((i) =>
          db.supplierOffer.updateMany({
            where: { supplier: "SM", supplierSku: i.sku.trim() },
            data: { stock: i.stock, stockState: i.estado, syncedAt: now },
          }),
        ),
      );
      for (const r of results) {
        if (r.count > 0) stats.updated++;
        else stats.unknown++; // SKU de SM que no importamos: se ignora
      }
    }
    stats.complete = true;
  } catch (e) {
    stats.error = e instanceof Error ? e.message : String(e);
  }

  await log({
    action: "sync.stock",
    ok: stats.complete,
    message:
      `paginas=${stats.pages} vistos=${stats.seen} actualizados=${stats.updated} sinImportar=${stats.unknown}` +
      (stats.error ? ` error=${stats.error}` : ""),
  });
  return stats;
}
