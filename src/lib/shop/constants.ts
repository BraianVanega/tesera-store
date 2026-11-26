/**
 * Constantes que SÍ pueden viajar al navegador. Nunca importar `config.ts` desde un
 * componente cliente: tiene costos y el % del operador.
 */

export const COOKIES = {
  zone: "tsr_zona",
  cart: "tsr_carrito",
  discrete: "tsr_discreto",
} as const;

export const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 días

/** Modo discreto (docs/02, docs/07). */
export const DISCRETE = {
  /** Título de pestaña neutro (también en carrito, checkout y pedido). */
  neutralTitle: "Mi pedido",
  /** Adónde lleva "Salir ya": un sitio neutro cualquiera. TODO(brai): confirmar. */
  exitUrl: "https://www.smn.gob.ar/",
} as const;
