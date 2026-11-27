import type { PrismaClient } from "@prisma/client";
import { cancelOrder } from "./cancel";
import type { Dispatcher } from "./mark-paid";

/**
 * Mantenimiento de pedidos (cron horario, docs/03):
 * - `expireOrders`: pendientes con el plazo vencido → CANCELLED y libera la reserva.
 * - `retryDispatch`: pagados con productos de SM que todavía no salieron (SM caído al pagar).
 */

export async function expireOrders(db: PrismaClient, now = new Date()) {
  const due = await db.order.findMany({
    where: { status: "PENDING_PAYMENT", paymentDueAt: { lt: now } },
    select: { id: true },
    take: 200,
  });
  let expired = 0;
  for (const o of due) {
    const r = await cancelOrder(db, o.id, "venció el plazo de pago", { by: "cron" });
    if (r.status === "cancelled") expired++;
  }
  return { expired };
}

export async function retryDispatch(db: PrismaClient, dispatch: Dispatcher) {
  const pending = await db.order.findMany({
    where: {
      status: "PAID",
      supplierOrderId: null,
      needsAttention: false, // los que necesitan datos los resuelve Eric
      items: { some: { source: "DROPSHIP" } },
    },
    select: { id: true },
    take: 50,
  });
  let ok = 0;
  let failed = 0;
  for (const o of pending) {
    try {
      await dispatch(o.id);
      ok++;
    } catch {
      failed++; // ya quedó en IntegrationLog
    }
  }
  return { retried: pending.length, ok, failed };
}
