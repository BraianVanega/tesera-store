import { config } from "dotenv";
import { z } from "zod";
import { createPrisma } from "../../src/lib/prisma";

// Scripts fuera de Next: cargan .env.local como lo hace Next.
config({ path: [".env.local", ".env"], quiet: true });

/** Cliente de Prisma para scripts (src/lib/db.ts es solo para el servidor de Next). */
export function scriptDb() {
  const url = z
    .string()
    .regex(/^postgres(ql)?:\/\//)
    .safeParse(process.env.DATABASE_URL);
  if (!url.success) {
    console.error("Falta DATABASE_URL (Postgres) en .env.local");
    process.exit(1);
  }
  return createPrisma(url.data);
}
