"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { ORDER_CODE_RE, safeTokenEqual } from "@/lib/orders/code";
import { paymentDueAt } from "@/lib/orders/create";
import { mercadoPago } from "@/lib/payments/server";
import { PROOF_MAX_BYTES, PROOF_TYPES, uploadPrivateProof } from "@/lib/storage/blob";

/** Acciones de /pedido/[code]. Todas exigen el token del link (nunca solo el código). */

const ref = z.object({ code: z.string().regex(ORDER_CODE_RE), token: z.string().min(20).max(64) });

async function findOrder(form: FormData) {
  const r = ref.safeParse({ code: form.get("code"), token: form.get("token") });
  if (!r.success) return null;
  const order = await db().order.findUnique({ where: { code: r.data.code } });
  return order && safeTokenEqual(r.data.token, order.trackingToken) ? order : null;
}

export type ProofState = { ok?: boolean; error?: string };

export async function uploadProofAction(_prev: ProofState, form: FormData): Promise<ProofState> {
  const order = await findOrder(form);
  if (!order) return { error: "No encontramos el pedido." };
  if (order.status !== "PENDING_PAYMENT" || order.paymentMethod !== "TRANSFER") {
    return { error: "Este pedido ya no espera una transferencia." };
  }
  const file = form.get("proof");
  if (!(file instanceof File) || file.size === 0)
    return { error: "Elegí la foto o el PDF del comprobante." };
  if (!PROOF_TYPES[file.type]) return { error: "Subí una foto (JPG, PNG) o un PDF." };
  if (file.size > PROOF_MAX_BYTES) return { error: "El archivo pesa más de 10 MB." };
  const token = env().BLOB_READ_WRITE_TOKEN;
  if (!token)
    return { error: "No pudimos recibir el archivo. Mandanos el comprobante por WhatsApp." };
  try {
    const url = await uploadPrivateProof(order.code, file, file.type, token);
    await db().order.update({ where: { id: order.id }, data: { paymentProofUrl: url } });
  } catch {
    await db()
      .integrationLog.create({
        data: { service: "BLOB", action: "proof.upload", ok: false, orderCode: order.code },
      })
      .catch(() => {});
    return { error: "No pudimos subir el archivo. Probá de nuevo o mandalo por WhatsApp." };
  }
  return { ok: true };
}

/** Pago con MP rechazado o abandonado: nueva preferencia para el mismo pedido. */
export async function retryMpAction(form: FormData): Promise<void> {
  const order = await findOrder(form);
  if (!order || order.status !== "PENDING_PAYMENT" || order.paymentMethod !== "MP") return;
  // Nueva ventana para pagar (la reserva no se acorta si ya era más larga, p. ej. un ticket).
  const due = paymentDueAt("MP", new Date());
  const until = order.paymentDueAt && order.paymentDueAt > due ? order.paymentDueAt : due;
  await db().order.update({ where: { id: order.id }, data: { paymentDueAt: until } });
  let url: string;
  try {
    url = (await mercadoPago.start({ ...order, paymentDueAt: until })).url;
  } catch {
    return;
  }
  redirect(url);
}
