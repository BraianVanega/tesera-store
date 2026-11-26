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
