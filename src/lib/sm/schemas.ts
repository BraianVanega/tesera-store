import { z } from "zod";

/**
 * Schemas de la API de SexShopMayorista (docs/sm-api/, v1 19/11/2026).
 * Campos copiados de la doc oficial (PDF + https://www.sexshopmayorista.com/api/docs).
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

/** Envoltorio genérico `{ ok: true, data }`. */
export const smOk = <T extends z.ZodType>(data: T) => z.object({ ok: z.literal(true), data });

/** Error documentado: `{ ok: false, error }` (422 trae además `data.items`, sin ejemplo en la doc). */
export const smErrorSchema = z.object({
  ok: z.literal(false),
  error: z.string(),
  data: z
    .object({ items: z.array(z.unknown()).optional() })
    .partial()
    .optional(),
});

const paged = <T extends z.ZodType>(item: T) =>
  z.object({
    total: z.number().int(),
    page: z.number().int(),
    pageSize: z.number().int(),
    totalPaginas: z.number().int(),
    items: z.array(item),
  });

export const smProductsDataSchema = paged(smProductSchema);

/**
 * Ítem de /stock. La doc NO muestra su forma: solo se exige lo que usamos (sku, stock, estado),
 * que son los mismos campos que en /products. TODO(brai): confirmar con la primera respuesta real.
 */
export const smStockItemSchema = z.looseObject({
  sku: z.string().min(1),
  stock: z.number().int().min(0),
  estado: smStockState,
});
export type SmStockItem = z.infer<typeof smStockItemSchema>;
export const smStockDataSchema = paged(smStockItemSchema);

export const smProvincesDataSchema = z.object({
  total: z.number().int(),
  items: z.array(z.object({ id: z.number().int(), descripcion: z.string() })),
});
export type SmProvince = z.infer<typeof smProvincesDataSchema>["items"][number];

// ── Cotización ───────────────────────────────────────

export type SmQuoteRequest = {
  destino: {
    cp: string;
    localidad?: string;
    provinciaId?: number;
    calle?: string;
    numero?: string;
    agencyId?: string;
  };
  /** Mandar siempre items: solo así hay quoteId. `paquete` es la alternativa sin quoteId. */
  items?: { sku: string; cantidad: number }[];
  paquete?: { pesoGr: number; altoCm: number; anchoCm: number; largoCm: number };
};

export const smQuoteOptionSchema = z.object({
  carrier: z.string(), // MOOVA | CORREO
  carrierNombre: z.string(),
  servicio: z.string(), // FLEX | CP | EP
  tipoEntrega: z.enum(["D", "S"]), // domicilio | sucursal
  code: z.string().min(1), // moova-flex, ca-cp-dom, ca-cp-suc, ca-ep-dom
  nombre: z.string(),
  precio: z.number().nonnegative(), // final, con impuestos, ARS
  plazoMinDias: z.number().int().min(0),
  plazoMaxDias: z.number().int().min(0),
});
export type SmQuoteOption = z.infer<typeof smQuoteOptionSchema>;

export const smQuoteDataSchema = z.object({
  quoteId: z.string().nullish(), // solo con items
  venceEn: z.string().nullish(),
  paquete: z
    .object({
      calculadoDeItems: z.boolean(),
      bultos: z.number().int(),
      pesoGr: z.number(),
      pesoTotalGr: z.number(),
      largoCm: z.number(),
      anchoCm: z.number(),
      altoCm: z.number(),
    })
    .partial()
    .nullish(),
  total: z.number().int().optional(),
  options: z.array(smQuoteOptionSchema),
});
export type SmQuote = z.infer<typeof smQuoteDataSchema>;

export const smAgenciesDataSchema = z.object({
  total: z.number().int(),
  mensaje: z.string().nullish(), // cuando total = 0
  items: z.array(
    z.object({
      codigo: z.string(),
      nombre: z.string(),
      direccion: z.string(),
      localidad: z.string(),
      cp: z.string(),
    }),
  ),
});
export type SmAgency = z.infer<typeof smAgenciesDataSchema>["items"][number];

// ── Pedidos ──────────────────────────────────────────

/** Body de POST /orders. Sin `comprador`: SM no necesita el email (discreción, docs/04). */
export type SmOrderRequest = {
  externalOrderId: string;
  envio: {
    nombre: string;
    telefono: string;
    calle: string;
    numero: string;
    piso?: string;
    localidad: string;
    codigoPostal: string;
    provincia: string;
    provinciaId?: number;
    shippingCode: string;
    quoteId: string;
    agencyId?: string;
  };
  items: { sku: string; cantidad: number }[];
  totalVentaFinal: number;
  moneda: "ARS";
  notas?: string;
};

/** 201 (creado) o 200 con `yaExistia: true` (idempotente). */
export const smOrderCreatedSchema = z.object({
  pedidoId: z.number().int(),
  externalOrderId: z.string(),
  estado: z.string(),
  totalMayorista: z.number().nullish(),
  warnings: z.array(z.string()).default([]),
  yaExistia: z.boolean().optional(),
});
export type SmOrderCreated = z.infer<typeof smOrderCreatedSchema>;

/** GET /orders/{externalOrderId}. `fulfillmentStatus`: valores no documentados (docs/04). */
export const smOrderStatusSchema = z.object({
  externalOrderId: z.string(),
  pedidoId: z.number().int(),
  estado: z.string(),
  fechaIngesta: z.string().nullish(),
  fulfillmentStatus: z.string().nullish(),
  trackingCode: z.string().nullish(),
});
export type SmOrderStatus = z.infer<typeof smOrderStatusSchema>;
