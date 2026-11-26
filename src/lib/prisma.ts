import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

/** Crea un cliente de Prisma 7 (driver adapter de Postgres). Lo usan la app (db.ts) y los scripts. */
export function createPrisma(connectionString: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}
