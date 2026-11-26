import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// Mismo orden que Next: .env.local pisa a .env.
config({ path: [".env.local", ".env"], quiet: true });

// Migraciones y CLI usan la conexión directa (sin pooler). El runtime usa DATABASE_URL (src/lib/db.ts).
// Fallback a DATABASE_URL para que `prisma generate`/`validate` corran en CI sin base.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "",
  },
});
