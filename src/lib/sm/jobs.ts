import "server-only";
import { revalidateTag } from "next/cache";
import { db } from "../db";
import { env } from "../env";
import { downloadImage, uploadPublicImage } from "../storage/blob";
import { integrationLogger } from "./log";
import { requireSmClient } from "./server";
import { pollOrderStatuses } from "./status";
import { syncProducts, syncStock } from "./sync";

/** Jobs de SM que disparan los crons (src/app/api/cron/*). */

function imageDeps() {
  const token = env().BLOB_READ_WRITE_TOKEN;
  if (!token) return undefined;
  return {
    download: downloadImage,
    upload: (path: string, body: ArrayBuffer, type: string) =>
      uploadPublicImage(path, body, type, token),
  };
}

export async function runProductSync(mode: "full" | "incremental") {
  const stats = await syncProducts(
    { db: db(), client: requireSmClient(), log: integrationLogger(db()), images: imageDeps() },
    mode,
  );
  revalidateTag("catalog", "max");
  return stats;
}

export async function runStockSync() {
  const stats = await syncStock({
    db: db(),
    client: requireSmClient(),
    log: integrationLogger(db()),
  });
  revalidateTag("catalog", "max");
  return stats;
}

export async function runOrderPoll() {
  return pollOrderStatuses(db(), requireSmClient(), integrationLogger(db()));
}
