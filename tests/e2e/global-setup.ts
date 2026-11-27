import { config } from "dotenv";
import { createPrisma } from "../../src/lib/prisma";
import { startFakes } from "./fakes";

export const E2E_EMAIL_DOMAIN = "@tesera.test";

/**
 * Antes del e2e:
 * - Simula un sync de SM reciente (las ofertas viejas cuentan como sin stock).
 * - Borra los pedidos de corridas anteriores (email @tesera.test) y les devuelve el stock: así el
 *   catálogo de ejemplo no se agota de tanto probar. Solo toca pedidos de prueba.
 * - Levanta SM y Mercado Pago falsos. Devuelve el teardown.
 */
export default async function globalSetup() {
  config({ path: [".env.local", ".env"], quiet: true });
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Falta DATABASE_URL para el e2e");
  const db = createPrisma(url);
  try {
    await db.supplierOffer.updateMany({ data: { syncedAt: new Date() } });
    const orders = await db.order.findMany({
      where: { customerEmail: { endsWith: E2E_EMAIL_DOMAIN } },
      select: { id: true },
    });
    const ids = orders.map((o) => o.id);
    if (ids.length) {
      await db.$transaction(async (tx) => {
        // Ventas de prueba: vuelve la mercadería.
        const sold = await tx.stockMovement.findMany({ where: { orderId: { in: ids } } });
        for (const m of sold) {
          await tx.localStock.update({
            where: { productId: m.productId },
            data: { quantity: { decrement: m.quantity } },
          });
        }
        await tx.stockMovement.deleteMany({ where: { orderId: { in: ids } } });
        await tx.encargo.deleteMany({ where: { orderId: { in: ids } } });
        await tx.paymentEvent.deleteMany({ where: { orderId: { in: ids } } });
        await tx.order.deleteMany({ where: { id: { in: ids } } });
        // Reservas = lo que siguen reservando los pedidos pendientes que no son de prueba.
        await tx.$executeRaw`
          UPDATE "LocalStock" ls SET "reserved" = COALESCE((
            SELECT SUM(oi."quantity") FROM "OrderItem" oi JOIN "Order" o ON o."id" = oi."orderId"
            WHERE oi."productId" = ls."productId" AND oi."source" = 'LOCAL' AND o."status" = 'PENDING_PAYMENT'
          ), 0)`;
      });
    }
  } finally {
    await db.$disconnect();
  }
  const servers = await startFakes(`http://localhost:${process.env.E2E_PORT ?? 3000}`);
  return async () => {
    await Promise.all(servers.map((s) => new Promise((r) => s.close(r))));
  };
}
