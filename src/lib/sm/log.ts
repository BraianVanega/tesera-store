import type { PrismaClient } from "@prisma/client";
import type { SmLogEntry } from "./client";

/** Logger a IntegrationLog. Sin PII: solo acción, status, código de pedido y un mensaje corto. */
export function integrationLogger(db: PrismaClient, service: "SM" | "CRON" = "SM") {
  return async (e: SmLogEntry) => {
    await db.integrationLog.create({
      data: {
        service,
        action: e.action,
        ok: e.ok,
        httpStatus: e.httpStatus ?? null,
        orderCode: e.orderCode ?? null,
        message: e.message?.slice(0, 500) ?? null,
      },
    });
  };
}
