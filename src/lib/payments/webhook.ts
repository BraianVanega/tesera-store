import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Firma de los webhooks de Mercado Pago (docs/05).
 *
 * Header `x-signature: ts=…,v1=…` + header `x-request-id` + `data.id` del query string + la firma
 * secreta de "Configuración de Webhooks". Plantilla según la doc oficial de Checkout Pro (Orders),
 * "Validar el origen de la notificación": `id:{data.id};request-id:{x-request-id};ts:{ts};`,
 * HMAC-SHA256 en hex, `data.id` en minúsculas (ORD01… → ord01…) y omitiendo las partes ausentes.
 *
 * No se valida la antigüedad de `ts`: MP reintenta cada 15 min con el mismo evento y el
 * procesamiento ya es idempotente (y el pago se consulta a la API, nunca se toma del body).
 */

export function parseSignatureHeader(header: string | null): { ts: string; v1: string } | null {
  if (!header) return null;
  const parts = Object.fromEntries(
    header.split(",").map((kv) => {
      const [k, ...v] = kv.split("=");
      return [k.trim(), v.join("=").trim()];
    }),
  );
  return parts.ts && parts.v1 ? { ts: parts.ts, v1: parts.v1 } : null;
}

export function signatureManifest(dataId: string | null, requestId: string | null, ts: string) {
  let m = "";
  if (dataId) m += `id:${/^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId};`;
  if (requestId) m += `request-id:${requestId};`;
  m += `ts:${ts};`;
  return m;
}

export function verifyMpSignature(args: {
  signature: string | null;
  requestId: string | null;
  dataId: string | null;
  secret: string;
}): boolean {
  const sig = parseSignatureHeader(args.signature);
  if (!sig || !args.secret) return false;
  const expected = createHmac("sha256", args.secret)
    .update(signatureManifest(args.dataId, args.requestId, sig.ts))
    .digest("hex");
  const a = Buffer.from(sig.v1);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Para tests y el MP falso: arma un header válido. */
export function signForTest(args: {
  dataId: string;
  requestId: string;
  ts: string;
  secret: string;
}) {
  const v1 = createHmac("sha256", args.secret)
    .update(signatureManifest(args.dataId, args.requestId, args.ts))
    .digest("hex");
  return `ts=${args.ts},v1=${v1}`;
}
