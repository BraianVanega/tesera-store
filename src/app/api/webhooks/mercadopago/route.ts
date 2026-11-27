import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { processMpOrder } from "@/lib/payments/process";
import { dispatchToSm, mpClient } from "@/lib/payments/server";
import { verifyMpSignature } from "@/lib/payments/webhook";

/**
 * Webhook de Mercado Pago (docs/05):
 * 1. Verifica la firma (`x-signature` + `x-request-id` + `data.id`). Sin firma válida → 401.
 * 2. Solo procesa `type=order` (API de Orders); el resto se acepta y se ignora.
 * 3. Consulta la order a la API y aplica (idempotente). Responde 200; si algo falla → 500 y MP
 *    reintenta (cada 15 min). Logs sin PII.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const body = (await request.json().catch(() => null)) as {
    type?: string;
    data?: { id?: string | number };
  } | null;
  const dataId =
    url.searchParams.get("data.id") ?? (body?.data?.id != null ? String(body.data.id) : null);
  const type = url.searchParams.get("type") ?? body?.type ?? null;

  const secret = env().MP_WEBHOOK_SECRET;
  const valid =
    !!secret &&
    verifyMpSignature({
      signature: request.headers.get("x-signature"),
      requestId: request.headers.get("x-request-id"),
      dataId,
      secret,
    });
  if (!valid) {
    await db()
      .integrationLog.create({
        data: {
          service: "MP",
          action: "webhook",
          ok: false,
          httpStatus: 401,
          message: "firma inválida",
        },
      })
      .catch(() => {});
    return Response.json({ ok: false }, { status: 401 });
  }
  if (type !== "order" || !dataId) return Response.json({ ok: true, ignored: true });

  try {
    const r = await processMpOrder(db(), mpClient(), dataId, { dispatch: dispatchToSm });
    return Response.json({ ok: true, ...r });
  } catch (e) {
    await db()
      .integrationLog.create({
        data: {
          service: "MP",
          action: "webhook",
          ok: false,
          message: (e instanceof Error ? e.message : String(e)).slice(0, 300),
        },
      })
      .catch(() => {});
    return Response.json({ ok: false }, { status: 500 });
  }
}
