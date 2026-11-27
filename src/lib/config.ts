// Parámetros de negocio. Cambiar acá, nunca hardcodear en componentes.

export type Zone = "MDP" | "AMBA" | "INTERIOR";

export const config = {
  /** Descuento por pagar con transferencia, sobre precio de lista (%). */
  transferDiscountPct: 10,
  /** % de la ganancia neta que cobra Eric (operador, no socio). Acuerdo transitorio: puede cambiar. */
  operatorProfitSharePct: 40,

  /** Umbral de envío gratis, sobre subtotal A PRECIO DE LISTA (pesos). */
  freeShipping: {
    MDP: 15_000,
    CABA: 30_000,
    GBA: 40_000,
    INTERIOR: null as number | null, // sin envío gratis por ahora
  },

  /** Código postal de Mar del Plata y zona. */
  mdpPostalRange: { from: 7600, to: 7612 },

  /** CABA por CP numérico (C1000–C1499). El resto de AMBA se considera GBA. */
  cabaPostalRange: { from: 1000, to: 1499 },

  /** Horas de reserva de una transferencia antes de cancelar el pedido. */
  transferHoldHours: 24,

  /**
   * Horas de reserva de un pedido con Mercado Pago mientras el cliente paga (si abandona, se libera).
   * TODO(brai): confirmar (propuesta 2 h).
   */
  mpHoldHours: 2,

  /**
   * Efectivo vía MP (Rapipago / Pago Fácil): vencimiento del ticket (`default_payment_due_date` de
   * la order; MP recomienda al menos 3 días) + 2 h hábiles de acreditación. Reserva = ticket + margen.
   */
  cashTicketDays: 3,
  cashHoldExtraHours: 6,

  /** Cadete en Mar del Plata, POR TANDA (gratis si la tanda llega a freeShipping.MDP). Brai, 26/11. */
  mdpCourierFee: 2_500,

  /** Mercado Pago Checkout Pro (docs/05). */
  mp: {
    apiBaseUrl: "https://api.mercadopago.com",
    /** Ítem neutro de la order: nunca nombres de producto. */
    itemTitle: "Pedido Tésera",
    /** Resumen de tarjeta (MP acepta hasta 13 caracteres). TODO(brai): nombre de fantasía definitivo. */
    statementDescriptor: "TESERA",
  },

  /** Stock local por debajo del cual el pedido semanal sugiere reponer. */
  lowStockThreshold: 2,

  /** Cargo de acondicionamiento de SM en dropshipping, POR PEDIDO (pesos). Confirmado 25/11/2026. */
  smDropshipFeePerOrder: 2_300,

  /** Margen mínimo (% sobre el subtotal de lista) por pedido dropship. TODO(brai): definir. */
  minDropshipMarginPct: 25,

  /** Costos fijos mensuales que se descuentan en la liquidación (pesos). */
  fixedMonthlyCosts: [{ name: "Abono SexShopMayorista", amount: 50_000 }],

  /** Integración con SexShopMayorista (docs/04). */
  sm: {
    baseUrl: "https://www.sexshopmayorista.com",
    /** Oferta sin sincronizar hace más de esto = sin stock. TODO(brai): confirmar (propuesta 6 h). */
    staleHours: 6,
    /** Por debajo de este % del tope diario se frena el sync; cotizaciones y pedidos siguen. */
    syncBudgetFloorPct: 20,
    pageSize: 200, // máximo que acepta SM
    timeoutMs: 10_000,
    maxRetries: 3,
    /** Si SM pide esperar más que esto (429 diario), no se espera: se corta y se reintenta en el próximo cron. */
    maxRetryAfterMs: 60_000,
    /** Cache de cotizaciones por (destino, ítems). La cotización vale 24 h; la cacheamos menos. */
    quoteCacheMinutes: 10,
    /** Días hábiles de preparación que se suman al plazo del transportista (docs/04). */
    prepDays: 1,
    /** Bulto de referencia para detectar la zona con solo el CP (sin ítems: no da quoteId). */
    probePackage: { pesoGr: 500, altoCm: 10, anchoCm: 15, largoCm: 20 },
  },

  /** Texto de plazos por fuente/zona (los usa availability()). */
  delivery: {
    LOCAL: "Hoy en Mar del Plata",
    ENCARGO: "Llega en 5 a 10 días", // ENCARGO es término interno; al cliente nunca se le dice "por encargo"
    DROPSHIP_AMBA: "Llega en 48 h", // envío dropship de SM (Moova Flex). Confirmado por Brai 25/11
    DROPSHIP_INTERIOR: "Envío 3 a 6 días",
  },
} as const;
