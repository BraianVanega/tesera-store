import { put } from "@vercel/blob";

const MAX_BYTES = 10 * 1024 * 1024;

/** Sube una foto de producto a Vercel Blob (público: son fotos de catálogo, sin datos personales). */
export async function uploadPublicImage(
  path: string,
  body: ArrayBuffer,
  contentType: string,
  token: string,
): Promise<string> {
  const blob = await put(path, body, {
    access: "public",
    contentType,
    token,
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 60 * 60 * 24 * 365,
  });
  return blob.url;
}

/** Descarga una imagen con timeout y tope de tamaño. */
export async function downloadImage(
  url: string,
): Promise<{ body: ArrayBuffer; contentType: string }> {
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/")) throw new Error(`No es una imagen: ${contentType}`);
  const body = await res.arrayBuffer();
  if (body.byteLength > MAX_BYTES) throw new Error("Imagen demasiado grande");
  return { body, contentType };
}

/** Tipos de comprobante aceptados (foto o PDF del banco). */
export const PROOF_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "application/pdf": "pdf",
};
export const PROOF_MAX_BYTES = 10 * 1024 * 1024;

/**
 * Comprobante de transferencia: Blob PRIVADO (datos bancarios del cliente, docs/07). Solo se lee
 * desde el panel con el token del servidor. Ruta neutra: código de pedido + sufijo aleatorio.
 */
export async function uploadPrivateProof(
  code: string,
  file: Blob,
  contentType: string,
  token: string,
): Promise<string> {
  const ext = PROOF_TYPES[contentType];
  if (!ext) throw new Error("Tipo de archivo no soportado");
  const blob = await put(`comprobantes/${code}.${ext}`, file, {
    access: "private",
    contentType,
    token,
    addRandomSuffix: true,
  });
  return blob.url;
}
