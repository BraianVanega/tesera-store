import type { PrismaClient } from "@prisma/client";
import { orderTransitions, type OrderStatus } from "../orders/transitions";
import type { SmClient, SmLogEntry } from "./client";
import type { SmOrderStatus } from "./schemas";

/**
 * Seguimiento de pedidos dropship (docs/04 "Estado del pedido").
 * Los valores de `fulfillmentStatus` NO están documentados: se guardan crudos en
 * `supplierStatus` y cada valor nuevo queda en IntegrationLog para mapearlos después.
 * TODO(brai): pedirle a SM la lista de valores (docs/11).
 */

/** Único valor visto en la doc oficial. */
const SHIPPED_VALUES = new Set(["despachado"]);

export type StatusUpdate = {
  supplierStatus?: string | null;
  trackingCode?: string;
  status?: OrderStatus;
  /** Valor de fulfillmentStatus que no veníamos guardando. */
  newRawStatus?: string;
};

/** Pura: qué cambiar en el pedido según la respuesta de SM. `{}` = nada. */
export function statusUpdate(
  order: { status: OrderStatus; supplierStatus: string | null; trackingCode: string | null },
  sm: Pick<SmOrderStatus, "fulfillmentStatus" | "trackingCode">,
): StatusUpdate {
  const out: StatusUpdate = {};
  const raw = sm.fulfillmentStatus?.trim() || null;
  if (raw !== order.supplierStatus) {
    out.supplierStatus = raw;
    if (raw) out.newRawStatus = raw;
  }
  const tracking = sm.trackingCode?.trim();
  if (tracking && tracking !== order.trackingCode) out.trackingCode = tracking;

  const shipped = Boolean(tracking) || (raw != null && SHIPPED_VALUES.has(raw.toLowerCase()));
  if (shipped && orderTransitions.can(order.status, "SHIPPED")) out.status = "SHIPPED";
  return out;
}

export async function pollOrderStatuses(
  db: PrismaClient,
  client: Pick<SmClient, "orderStatus">,
  log: (e: SmLogEntry) => Promise<void> | void,
  opts: { limit?: number } = {},
): Promise<{ checked: number; updated: number; shipped: number; failed: number }> {
  const orders = await db.order.findMany({
    where: { supplierOrderId: { not: null }, status: "FULFILLING" },
    select: { id: true, code: true, status: true, supplierStatus: true, trackingCode: true },
    orderBy: { dispatchedAt: "asc" },
    take: opts.limit ?? 50,
  });

  const stats = { checked: 0, updated: 0, shipped: 0, failed: 0 };
  for (const o of orders) {
    stats.checked++;
    let sm: SmOrderStatus | null;
    try {
      sm = await client.orderStatus(o.code);
    } catch (e) {
      stats.failed++;
      // Sin cupo para el sync: cortar acá, el próximo cron sigue.
      if (e instanceof Error && "code" in e && e.code === "budget") break;
      continue;
    }
    if (!sm) {
      stats.failed++;
      await log({ action: "orders.status", ok: false, httpStatus: 404, orderCode: o.code });
      continue;
    }
    const u = statusUpdate(o, sm);
    if (u.newRawStatus) {
      await log({
        action: "orders.status",
        ok: true,
        orderCode: o.code,
        message: `fulfillmentStatus=${u.newRawStatus}`.slice(0, 200),
      });
    }
    const data = {
      ...(u.supplierStatus !== undefined ? { supplierStatus: u.supplierStatus } : {}),
      ...(u.trackingCode ? { trackingCode: u.trackingCode } : {}),
      ...(u.status ? { status: u.status } : {}),
    };
    if (Object.keys(data).length) {
      await db.order.update({ where: { id: o.id }, data });
      stats.updated++;
      if (u.status === "SHIPPED") stats.shipped++;
    }
  }
  return stats;
}
