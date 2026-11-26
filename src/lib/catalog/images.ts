/**
 * Fotos de producto: cada URL del proveedor se descarga UNA sola vez y se sirve desde nuestro
 * storage (docs/04). La URL de SM trae hash de contenido: misma URL = misma foto.
 * I/O inyectado (fetch y storage) para poder testearlo sin red.
 */

export type SourceImage = { sourceUrl: string; position: number };
export type StoredImage = { sourceUrl: string; url: string; position: number };

export type ImageDeps = {
  /** Descarga la imagen del proveedor. */
  download: (url: string) => Promise<{ body: ArrayBuffer; contentType: string }>;
  /** Sube a nuestro storage y devuelve la URL pública. */
  upload: (path: string, body: ArrayBuffer, contentType: string) => Promise<string>;
};

/** Solo las que todavía no tenemos (comparando por URL de origen). */
export function imagesToDownload(
  images: SourceImage[],
  alreadyStored: Iterable<string>,
): SourceImage[] {
  const have = new Set(alreadyStored);
  const seen = new Set<string>();
  return images.filter((img) => {
    if (have.has(img.sourceUrl) || seen.has(img.sourceUrl)) return false;
    seen.add(img.sourceUrl);
    return true;
  });
}

const EXT: Record<string, string> = {
  "image/webp": "webp",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/avif": "avif",
};

/**
 * Ruta en el storage: neutra (sin nombre de producto) y estable por URL de origen,
 * así una re-subida accidental pisa el mismo archivo en vez de duplicarlo.
 */
export async function storagePath(sourceUrl: string, contentType: string): Promise<string> {
  const ext = EXT[contentType.split(";")[0].trim()];
  if (!ext) throw new Error(`Tipo de imagen no soportado: ${contentType}`);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(sourceUrl));
  const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  return `p/${hex.slice(0, 32)}.${ext}`;
}

/**
 * Descarga y sube las fotos que faltan. Si una falla, sigue con las demás y la informa:
 * el error no se traga (lo registra quien llama en IntegrationLog).
 */
export async function syncImages(
  images: SourceImage[],
  alreadyStored: Iterable<string>,
  deps: ImageDeps,
): Promise<{ stored: StoredImage[]; failed: { sourceUrl: string; error: string }[] }> {
  const stored: StoredImage[] = [];
  const failed: { sourceUrl: string; error: string }[] = [];
  for (const img of imagesToDownload(images, alreadyStored)) {
    try {
      if (!img.sourceUrl.startsWith("https://")) throw new Error("Solo se aceptan URLs https");
      const { body, contentType } = await deps.download(img.sourceUrl);
      const url = await deps.upload(
        await storagePath(img.sourceUrl, contentType),
        body,
        contentType,
      );
      stored.push({ sourceUrl: img.sourceUrl, url, position: img.position });
    } catch (e) {
      failed.push({ sourceUrl: img.sourceUrl, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return { stored, failed };
}
