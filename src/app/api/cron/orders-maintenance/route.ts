import { runCron } from "@/lib/cron-route";
import { db } from "@/lib/db";
import { expireOrders, retryDispatch } from "@/lib/orders/jobs";
import { dispatchToSm } from "@/lib/payments/server";

/** Cron horario (.github/workflows/cron.yml): vence pedidos impagos y reintenta despachos a SM. */
export const maxDuration = 300;

export function GET(request: Request) {
  return runCron(request, "orders-maintenance", async () => ({
    ...(await expireOrders(db())),
    ...(await retryDispatch(db(), dispatchToSm)),
  }));
}
