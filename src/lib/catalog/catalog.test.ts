import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { smProductsPageSchema } from "../sm/schemas";
import { CATEGORIES, categoryBySlug, isCategory, silhouetteFor } from "./categories";
import { imagesToDownload, storagePath, syncImages } from "./images";
import { mapSmProduct, slugify, uniqueSlug } from "./import";
import { toCatalogProduct } from "./queries";

const fixture = JSON.parse(readFileSync("tests/fixtures/sm/products.json", "utf8"));
const now = new Date("2026-11-25T12:00:00Z");

describe("schema de producto de SM", () => {
  it("valida el ejemplo de la doc oficial", () => {
    const page = smProductsPageSchema.parse(fixture);
    expect(page.data.items).toHaveLength(2);
  });
  it("rechaza estados desconocidos y stock negativo", () => {
    const bad = structuredClone(fixture);
    bad.data.items[0].estado = "raro";
    expect(smProductsPageSchema.safeParse(bad).success).toBe(false);
    bad.data.items[0].estado = "disponible";
    bad.data.items[0].stock = -1;
    expect(smProductsPageSchema.safeParse(bad).success).toBe(false);
  });
});

describe("importación desde SM", () => {
  const [a, b] = smProductsPageSchema.parse(fixture).data.items;

  it("crea un borrador sin publicar y sin categoría", () => {
    const m = mapSmProduct(a, { now });
    expect(m.draft).toEqual({
      slug: "producto-de-ejemplo",
      name: "Producto de ejemplo",
      price: 24_990,
      category: "sin-categoria",
      brand: "Marca X",
      isConsumable: false,
      published: false,
    });
  });

  it("dos ofertas (dropship y stock) con el costo en pesos enteros", () => {
    const m = mapSmProduct(a, { now });
    expect(m.offers.map((o) => o.mode)).toEqual(["DROPSHIP", "STOCK"]);
    expect(m.offers[0]).toMatchObject({
      supplierSku: "ABC123",
      cost: 18_743,
      stock: 12,
      stockState: "disponible",
      suggested: 24_990,
      syncedAt: now,
      weightGr: 350,
    });
  });

  it("ordena las fotos por `orden`", () => {
    expect(mapSmProduct(a, { now }).images.map((i) => i.sourceUrl.slice(-8))).toEqual([
      "abc.webp",
      "def.webp",
    ]);
  });

  it("tolera campos informativos nulos y guarda la campaña", () => {
    const m = mapSmProduct(b, { now });
    expect(m.draft.brand).toBeNull();
    expect(m.offers[0]).toMatchObject({
      supplierSku: "XYZ 789",
      weightGr: null,
      dimensions: null,
      campaign: { nombre: "Campaña de ejemplo", descuentoPct: 30, hasta: "2026-12-31" },
    });
    expect(m.images).toEqual([]);
  });
});

describe("slugs", () => {
  it("sin tildes ni símbolos", () => {
    expect(slugify("Vibrador Nocturno Ñandú 3.0")).toBe("vibrador-nocturno-nandu-3-0");
    expect(slugify("  ¡Gel!  ")).toBe("gel");
    expect(slugify("a".repeat(100)).length).toBe(80);
  });
  it("si el slug está tomado, agrega el SKU y después un número", () => {
    const taken = new Set(["gel", "gel-abc1"]);
    expect(uniqueSlug("Gel", "ABC1", (s) => taken.has(s))).toBe("gel-abc1-2");
    expect(uniqueSlug("Gel", "Z9", (s) => taken.has(s))).toBe("gel-z9");
    expect(uniqueSlug("Aceite", "Z9", (s) => taken.has(s))).toBe("aceite");
    expect(uniqueSlug("¡¡!!", "Z9", () => false)).toBe("z9");
  });
});

describe("categorías", () => {
  it("las seis del diseño, con silueta", () => {
    expect(CATEGORIES.map((c) => c.slug)).toEqual([
      "succionadores",
      "vibradores",
      "anal",
      "lubricantes",
      "lenceria",
      "kits",
    ]);
    expect(isCategory("kits")).toBe(true);
    expect(isCategory("sin-categoria")).toBe(false);
    expect(categoryBySlug("lenceria")?.name).toBe("Lencería");
    expect(silhouetteFor("lubricantes")).toBe("sh-bottle");
    expect(silhouetteFor("otra")).toBe("sh-x");
  });
});

describe("fotos: una sola descarga por URL", () => {
  const imgs = [
    { sourceUrl: "https://cdn.example/a.webp", position: 1 },
    { sourceUrl: "https://cdn.example/b.webp", position: 2 },
    { sourceUrl: "https://cdn.example/a.webp", position: 3 },
  ];

  it("saltea las que ya tenemos y las repetidas", () => {
    expect(imagesToDownload(imgs, ["https://cdn.example/b.webp"])).toEqual([imgs[0]]);
  });

  it("ruta neutra y estable por URL", async () => {
    const p1 = await storagePath("https://cdn.example/a.webp", "image/webp");
    expect(p1).toMatch(/^p\/[0-9a-f]{32}\.webp$/);
    expect(await storagePath("https://cdn.example/a.webp", "image/webp; q=1")).toBe(p1);
    await expect(storagePath("x", "text/html")).rejects.toThrow(/no soportado/);
  });

  it("descarga y sube solo lo que falta; informa fallas sin cortar", async () => {
    const download = vi.fn(async (url: string) => {
      if (url.includes("b.webp")) throw new Error("timeout");
      return { body: new ArrayBuffer(1), contentType: "image/webp" };
    });
    const upload = vi.fn(async (path: string) => `https://blob.example/${path}`);
    const r = await syncImages(
      [...imgs, { sourceUrl: "http://inseguro/c.webp", position: 4 }],
      [],
      { download, upload },
    );
    expect(download).toHaveBeenCalledTimes(2);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(r.stored).toEqual([
      { sourceUrl: imgs[0].sourceUrl, url: expect.stringMatching(/^https:\/\/blob/), position: 1 },
    ]);
    expect(r.failed).toEqual([
      { sourceUrl: imgs[1].sourceUrl, error: "timeout" },
      { sourceUrl: "http://inseguro/c.webp", error: "Solo se aceptan URLs https" },
    ]);
  });

  it("informa errores que no son Error", async () => {
    const r = await syncImages([imgs[0]], [], {
      download: async () => {
        throw "boom";
      },
      upload: async () => "",
    });
    expect(r.failed[0].error).toBe("boom");
  });
});

describe("producto de catálogo", () => {
  const row = {
    id: "p1",
    slug: "gel-base-agua",
    name: "Gel base agua",
    description: null,
    price: 11_900,
    category: "lubricantes",
    brand: null,
    isConsumable: true,
    published: true,
    createdAt: now,
    updatedAt: now,
    images: [],
    localStock: { productId: "p1", quantity: 3, reserved: 1 },
    offers: [
      {
        id: "o1",
        productId: "p1",
        supplier: "SM" as const,
        supplierSku: "S1",
        mode: "DROPSHIP" as const,
        cost: 5_000,
        stock: 2,
        stockState: "bajo_stock",
        suggested: null,
        campaign: null,
        weightGr: null,
        dimensions: null,
        vatPct: null,
        syncedAt: now,
      },
    ],
  };

  it("arma la entrada de availability con stock local disponible", () => {
    const p = toCatalogProduct(row, now);
    expect(p.availabilityInput).toEqual({
      isConsumable: true,
      localQuantity: 2,
      offers: [{ supplier: "SM", mode: "DROPSHIP", stock: 2 }],
    });
    expect(p.silhouette).toBe("sh-bottle");
    expect(p.lowStock).toBe(true);
  });

  it("sin LocalStock → 0 local", () => {
    expect(
      toCatalogProduct({ ...row, localStock: null }, now).availabilityInput.localQuantity,
    ).toBe(0);
  });

  it("oferta de SM vieja (sync caído) → sin stock y sin 'últimas unidades'", () => {
    const later = new Date(now.getTime() + 7 * 3_600_000);
    const p = toCatalogProduct(row, later);
    expect(p.availabilityInput.offers).toEqual([{ supplier: "SM", mode: "DROPSHIP", stock: 0 }]);
    expect(p.lowStock).toBe(false);
  });
});
