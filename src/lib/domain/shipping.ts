import { config } from "../config";
import type { CartPlan } from "./cart";

/**
 * Cargo de envío al cliente (`charged`) y costo para la tienda (`cost`). Pura, pesos enteros.
 *
 * - MdP: un cadete por tanda (`config.mdpCourierFee`); cada tanda va gratis si su subtotal a lista
 *   llega a `config.freeShipping.MDP`. Con "todo junto" hay una sola tanda (definido por Brai, 26/11).
 * - AMBA/Interior: opciones cotizadas por SM. Si el pedido califica para envío gratis, la opción más
 *   barata va en $ 0 y las demás pagan la diferencia; la tienda absorbe el costo (Brai, 26/11).
 */

export type CourierCharge = {
  charged: number;
  cost: number;
  batches: { key: "TODAY" | "LATER"; base: number; charged: number }[];
};

export function courierCharge(
  plan: CartPlan,
  listPrice: (productId: string) => number,
  opts: { fee: number; threshold: number } = {
    fee: config.mdpCourierFee,
    threshold: config.freeShipping.MDP,
  },
): CourierCharge {
  const batches = plan.batches.map((b) => {
    const base = b.items.reduce((acc, i) => acc + listPrice(i.productId) * i.quantity, 0);
    return { key: b.key, base, charged: base >= opts.threshold ? 0 : opts.fee };
  });
  return {
    charged: batches.reduce((acc, b) => acc + b.charged, 0),
    // El cadete se paga igual aunque al cliente le salga gratis.
    cost: batches.length * opts.fee,
    batches,
  };
}

export function quotedShippingChoices<T extends { code: string; price: number }>(
  options: T[],
  freeShipping: boolean,
): (T & { charged: number; cost: number })[] {
  if (options.length === 0) return [];
  const cheapest = Math.min(...options.map((o) => o.price));
  return options.map((o) => ({
    ...o,
    charged: freeShipping ? o.price - cheapest : o.price,
    cost: o.price,
  }));
}
