import { config } from "dotenv";
import { createPrisma } from "../../src/lib/prisma";

/**
 * Simula un sync de SM reciente: las ofertas con `syncedAt` más viejo que `config.sm.staleHours`
 * cuentan como sin stock, y en desarrollo no corre el cron. Solo toca `syncedAt`.
 */
export default async function globalSetup() {
  config({ path: [".env.local", ".env"], quiet: true });
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Falta DATABASE_URL para el e2e");
  const db = createPrisma(url);
  try {
    await db.supplierOffer.updateMany({ data: { syncedAt: new Date() } });
  } finally {
    await db.$disconnect();
  }
}
