import "server-only";
import { db } from "./db";
import { env } from "./env";
import { isAuthorizedCron } from "./cron";

/**
 * Envoltorio común de los route handlers de cron: auth, respuesta JSON y log si el job explota.
 * Las respuestas solo traen conteos (sin PII).
 */
export async function runCron(
  request: Request,
  name: string,
  job: () => Promise<Record<string, unknown>>,
): Promise<Response> {
  if (!isAuthorizedCron(request.headers.get("authorization"), env().CRON_SECRET)) {
    return Response.json({ ok: false }, { status: 401 });
  }
  try {
    const result = await job();
    return Response.json({ ok: true, job: name, ...result });
  } catch (e) {
    const message = (e instanceof Error ? e.message : String(e)).slice(0, 300);
    await db()
      .integrationLog.create({ data: { service: "CRON", action: name, ok: false, message } })
      .catch(() => {});
    return Response.json({ ok: false, job: name, error: message }, { status: 500 });
  }
}
