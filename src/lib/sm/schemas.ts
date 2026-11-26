import { z } from "zod";

/**
 * Schemas de la API de SexShopMayorista (docs/sm-api/, v1 19/11/2026).
 * Fase 2 solo necesita el producto (importador). El resto llega en la Fase 3.
 *
 * Los campos que el importador usa son obligatorios; los informativos aceptan null/ausente
 * para que un cambio menor de SM no frene todo el sync.
 */

export const smStockState = z.enum(["disponible", "bajo_stock", "agotado"]);

export const smProductSchema = z.object({
  sku: z.string().min(1),
  nombre: z.string().min(1),
  upc: z.string().nullish(),
  marca: z.string().nullish(),
  precioSugeridoPublico: z.number().nonnegative(),
  costoCliente: z.number().nonnegative(),
  campania: z.object({ nombre: z.string(), descuentoPct: z.number(), hasta: z.string() }).nullish(),
  iva: z.number().nullish(),
  stock: z.number().int().min(0),
  estado: smStockState,
  permiteFlex: z.boolean().nullish(),
  pesoGramos: z.number().nullish(),
  dimensionesCm: z.object({ largo: z.number(), ancho: z.number(), alto: z.number() }).nullish(),
  imagenes: z.array(z.object({ orden: z.number().int(), url: z.string().url() })).default([]),
  ultimaActualizacion: z.string().nullish(),
});

export type SmProduct = z.infer<typeof smProductSchema>;

/** Respuesta paginada de /products: `{ ok, data: { total, page, pageSize, totalPaginas, items } }`. */
export const smProductsPageSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    total: z.number().int(),
    page: z.number().int(),
    pageSize: z.number().int(),
    totalPaginas: z.number().int(),
    items: z.array(smProductSchema),
  }),
});
