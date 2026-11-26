import "server-only";
import type { PrismaClient } from "@prisma/client";
import { env } from "./env";
import { createPrisma } from "./prisma";

// Singleton: evita abrir un pool nuevo en cada hot reload de `next dev`.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export function db(): PrismaClient {
  globalForPrisma.prisma ??= createPrisma(env().DATABASE_URL);
  return globalForPrisma.prisma;
}
