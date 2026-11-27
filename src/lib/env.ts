import "server-only";
import { z } from "zod";

/**
 * Variables de entorno del servidor, validadas con Zod.
 *
 * Fase 0: solo la base es obligatoria. Las integraciones quedan opcionales hasta su fase;
 * cada fase que las use las vuelve obligatorias acá (no hay que validarlas a mano en el código).
 *
 * Nunca exponer estos valores al cliente. Lo único público es NEXT_PUBLIC_MP_PUBLIC_KEY (docs/05).
 */

/** "" en un .env cuenta como "no definida". */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === "" ? undefined : v), schema.optional());

const postgresUrl = z
  .string()
  .url()
  .refine((v) => /^postgres(ql)?:\/\//.test(v), "Tiene que ser una URL de Postgres");

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  // App
  SITE_URL: z.string().url().default("http://localhost:3000"),

  // Base de datos (Neon/Supabase). DATABASE_URL = pooler (runtime); DIRECT_URL = directa (migraciones).
  DATABASE_URL: postgresUrl,
  DIRECT_URL: optional(postgresUrl),

  // SexShopMayorista (Fase 3, docs/04)
  SM_API_BASE_URL: optional(z.string().url()),
  SM_API_KEY: optional(z.string().startsWith("sm_", "La key de SM empieza con sm_")),

  // Mercado Pago (Fase 5, docs/05)
  MP_ACCESS_TOKEN: optional(z.string().min(1)),
  MP_WEBHOOK_SECRET: optional(z.string().min(1)),
  /** Solo para pruebas (MP falso local). En producción no se define. */
  MP_API_BASE_URL: optional(z.string().url()),

  // WhatsApp para recibir comprobantes (Fase 5). Solo dígitos, con código de país: 549223…
  WHATSAPP_NUMBER: optional(z.string().regex(/^\d{10,15}$/, "Solo dígitos con código de país")),

  // Transferencia (Fase 5, docs/05). TODO(brai): datos reales de la cuenta, solo en Vercel.
  TRANSFER_ALIAS: optional(z.string().min(1)),
  TRANSFER_CBU: optional(z.string().regex(/^\d{22}$/, "El CBU/CVU tiene 22 dígitos")),
  TRANSFER_HOLDER: optional(z.string().min(1)),

  // Emails (Fase 8) y comprobantes (Fase 5)
  RESEND_API_KEY: optional(z.string().min(1)),
  BLOB_READ_WRITE_TOKEN: optional(z.string().min(1)),

  // Vercel Cron: Vercel manda `Authorization: Bearer $CRON_SECRET`.
  CRON_SECRET: optional(z.string().min(16)),
});

export type Env = z.infer<typeof envSchema>;

/** Valida un objeto de entorno. El error lista solo NOMBRES de variables, nunca valores. */
export function parseEnv(raw: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Variables de entorno inválidas:\n${issues}`);
  }
  return result.data;
}

let cached: Env | undefined;

/** Entorno validado (lazy: no rompe el build si una ruta no lo usa). */
export function env(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}
