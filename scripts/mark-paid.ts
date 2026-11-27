/**
 * Verificación manual de una transferencia (hasta que exista el panel de Eric, Fase 7).
 *
 *   pnpm order:mark-paid TS-XXXXXX --by eric
 *
 * Usa el mismo `markPaid` que el webhook de MP. Si el pedido tiene productos de SM, los despacha
 * (necesita SM_API_KEY; si falla, el cron `orders-maintenance` lo reintenta).
 */
import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import { ORDER_CODE_RE } from "../src/lib/orders/code";
import { markPaid } from "../src/lib/orders/mark-paid";
import { createSmClient } from "../src/lib/sm/client";
import { dispatchOrder } from "../src/lib/sm/dispatch";
import { integrationLogger } from "../src/lib/sm/log";
import { scriptDb } from "./lib/db";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { by: { type: "string", default: "eric" } },
});

async function main() {
  const code = positionals[0]?.toUpperCase();
  if (!code || !ORDER_CODE_RE.test(code)) {
    console.error("Uso: pnpm order:mark-paid TS-XXXXXX [--by eric]");
    process.exit(1);
  }
  const db = scriptDb();
  try {
    const order = await db.order.findUnique({ where: { code } });
    if (!order) throw new Error("No existe ese pedido");
    if (order.paymentMethod !== "TRANSFER")
      throw new Error("Solo para transferencias (MP se confirma solo)");
    const key = process.env.SM_API_KEY;
    const sm = key?.startsWith("sm_")
      ? createSmClient({
          apiKey: key,
          baseUrl: process.env.SM_API_BASE_URL || undefined,
          log: integrationLogger(db),
        })
      : null;
    const r = await markPaid(db, order.id, {
      event: {
        provider: "TRANSFER",
        externalId: `manual-${randomUUID()}`,
        status: "verified",
        amount: order.total,
      },
      by: values.by,
      dispatch: sm ? (id) => dispatchOrder(db, sm, id) : undefined,
    });
    console.log(code, r);
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
