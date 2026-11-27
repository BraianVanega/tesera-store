import "server-only";
import type { Zone } from "../config";
import { db } from "../db";
import { detectZone, isMdp } from "../domain/zone";
import { env } from "../env";
import { createSmClient, type SmClient } from "./client";
import { integrationLogger } from "./log";
import { createQuoter } from "./quote";

/**
 * SM dentro de Next. `SM_API_KEY` es obligatoria solo acá (no en el build ni en la tienda sin SM):
 * sin key, `smClient()` devuelve null y la tienda sigue con la detección por CP.
 */

let client: SmClient | null | undefined;
let quoter: ReturnType<typeof createQuoter> | undefined;

export function smClient(): SmClient | null {
  if (client !== undefined) return client;
  const { SM_API_KEY, SM_API_BASE_URL } = env();
  client = SM_API_KEY
    ? createSmClient({
        apiKey: SM_API_KEY,
        baseUrl: SM_API_BASE_URL,
        log: integrationLogger(db()),
      })
    : null;
  return client;
}

export function requireSmClient(): SmClient {
  const c = smClient();
  if (!c) throw new Error("Falta SM_API_KEY");
  return c;
}

export function smQuoter() {
  const c = smClient();
  if (!c) return null;
  quoter ??= createQuoter(c);
  return quoter;
}

/**
 * Zona por CP para la tienda. MdP no consulta a SM. Para el resto se cotiza con solo el CP:
 * si aparece `moova-flex` es AMBA (CABA y GBA). Si SM no está configurado o falla, se cae a la
 * detección por CP (CABA por rango, el resto Interior) para no trabar la compra.
 */
export async function zoneForCp(cp: string): Promise<Zone> {
  if (isMdp(cp)) return "MDP";
  const q = smQuoter();
  if (!q) return detectZone(cp);
  try {
    return (await q({ cp, items: [] }, "cart")).zone;
  } catch {
    return detectZone(cp); // el error ya quedó en IntegrationLog
  }
}
