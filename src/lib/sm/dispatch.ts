import type { PrismaClient } from "@prisma/client";
import { orderTransitions, type OrderStatus } from "../orders/transitions";
import type { SmClient } from "./client";
import type { SmOrderRequest } from "./schemas";

/**
 * Despacho de un pedido dropship a SM (docs/04 "Crear pedido", CLAUDE.md regla 7).
 *
 * - `externalOrderId = order.code` → SM es idempotente: reenviar devuelve `yaExistia: true`.
 * - `quoteId` / `shippingCode` / `agencyId` son los del CHECKOUT (con calle y número).
 * - Nunca se manda el email ni el bloque `comprador`.
 * - SM acepta aunque falte stock y avisa con `warnings` → `needsAttention` para Eric.
 * - Se llama recién con el pedido `PAID` (lo dispara `markPaid` en la Fase 5).
 */

export type DispatchableOrder = {
  code: string;
  total: number;
  customerName: string | null;
  customerPhone: string | null;
  street: string | null;
  streetNumber: string | null;
  floor: string | null;
  locality: string | null;
  postalCode: string;
  provinceId: number | null;
  province: string | null;
  shippingCode: string | null;
  quoteId: string | null;
  agencyId: string | null;
  /** Solo las líneas DROPSHIP, con el SKU de SM. */
  lines: { sku: string; quantity: number }[];
};

export type BuildResult = { ok: true; body: SmOrderRequest } | { ok: false; missing: string[] };

/** Pura: pedido → body de `POST /orders`. Lista los campos que faltan en vez de inventarlos. */
export function buildSmOrder(o: DispatchableOrder): BuildResult {
  const required = {
    nombre: o.customerName?.trim(),
    telefono: o.customerPhone?.trim(),
    calle: o.street?.trim(),
    numero: o.streetNumber?.trim(),
    localidad: o.locality?.trim(),
    provincia: o.province?.trim(),
    shippingCode: o.shippingCode?.trim(),
    quoteId: o.quoteId?.trim(),
  };
  const missing = Object.entries(required)
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (o.lines.length === 0) missing.push("items");
  if (o.shippingCode?.endsWith("-suc") && !o.agencyId) missing.push("agencyId");
  if (missing.length) return { ok: false, missing };

  // Una línea por SKU (si el carrito repite producto en dos tandas, se suman).
  const qty = new Map<string, number>();
  for (const l of o.lines) qty.set(l.sku, (qty.get(l.sku) ?? 0) + l.quantity);

  const r = required as Record<keyof typeof required, string>;
  return {
    ok: true,
    body: {
      externalOrderId: o.code,
      envio: {
        nombre: r.nombre,
        telefono: r.telefono,
        calle: r.calle,
        numero: r.numero,
        ...(o.floor?.trim() ? { piso: o.floor.trim() } : {}),
        localidad: r.localidad,
        codigoPostal: o.postalCode.trim(),
        provincia: r.provincia,
        ...(o.provinceId != null ? { provinciaId: o.provinceId } : {}),
        shippingCode: r.shippingCode,
        quoteId: r.quoteId,
        ...(o.agencyId ? { agencyId: o.agencyId } : {}),
      },
      items: [...qty].map(([sku, cantidad]) => ({ sku, cantidad })),
      totalVentaFinal: o.total,
      moneda: "ARS",
    },
  };
}

export type DispatchOutcome =
  | { status: "dispatched"; supplierOrderId: number; warnings: string[]; alreadyExisted: boolean }
  | { status: "skipped"; reason: "not-paid" | "no-dropship" | "already-dispatched" }
  | { status: "needs-data"; missing: string[] };

/** Estados desde los que se puede (re)despachar. FULFILLING = reintento tras un timeout. */
const DISPATCHABLE: OrderStatus[] = ["PAID", "FULFILLING"];

export async function dispatchOrder(
  db: PrismaClient,
  client: Pick<SmClient, "createOrder">,
  orderId: string,
  now = new Date(),
): Promise<DispatchOutcome> {
  const order = await db.order.findUniqueOrThrow({
    where: { id: orderId },
    include: {
      items: {
        where: { source: "DROPSHIP" },
        include: {
          product: { include: { offers: { where: { supplier: "SM", mode: "DROPSHIP" } } } },
        },
      },
    },
  });

  if (!DISPATCHABLE.includes(order.status)) return { status: "skipped", reason: "not-paid" };
  if (order.items.length === 0) return { status: "skipped", reason: "no-dropship" };
  if (order.supplierOrderId != null) return { status: "skipped", reason: "already-dispatched" };

  const lines = order.items.flatMap((i) => {
    const sku = i.product.offers[0]?.supplierSku;
    return sku ? [{ sku, quantity: i.quantity }] : [];
  });
  const built: BuildResult =
    lines.length === order.items.length
      ? buildSmOrder({ ...order, lines })
      : { ok: false, missing: ["sku de SM"] };
  if (!built.ok) {
    await db.order.update({
      where: { id: order.id },
      data: {
        needsAttention: true,
        attentionNote: `No se pudo enviar a SM: faltan ${built.missing.join(", ")}`,
      },
    });
    return { status: "needs-data", missing: built.missing };
  }

  // Si SM falla, el error sube (ya quedó en IntegrationLog) y el pedido sigue PAID para reintentar.
  const res = await client.createOrder(built.body);

  await db.order.update({
    where: { id: order.id },
    data: {
      status:
        order.status === "PAID" ? orderTransitions.assert("PAID", "FULFILLING") : order.status,
      supplierOrderId: res.pedidoId,
      supplierWarnings: res.warnings,
      dispatchedAt: now,
      ...(res.warnings.length
        ? {
            needsAttention: true,
            attentionNote: `SM avisó: ${res.warnings.join(" · ")}`.slice(0, 500),
          }
        : {}),
    },
  });

  return {
    status: "dispatched",
    supplierOrderId: res.pedidoId,
    warnings: res.warnings,
    alreadyExisted: res.yaExistia === true,
  };
}
