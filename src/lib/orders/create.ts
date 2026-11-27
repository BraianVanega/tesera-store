import { Prisma, type PrismaClient } from "@prisma/client";
import { listPublishedByIds } from "../catalog/queries";
import { config } from "../config";
import {
  buildCheckout,
  checkoutTotals,
  COURIER_CODE,
  type CheckoutForm,
  type PaymentMethod,
  type QuotedOption,
} from "../shop/checkout";
import type { CartCookie, ShopZone } from "../shop/session";
import { orderCode, trackingToken } from "./code";

/**
 * Crea el pedido `PENDING_PAYMENT` (docs/03, docs/05). Recalcula TODO en el servidor: productos
 * frescos, disponibilidad, precios de la base y envío de la cotización de checkout. Del navegador
 * solo se toman los datos de entrega, la opción de envío (`code`) y el medio de pago.
 *
 * En una transacción: Order + OrderItems + reserva atómica del stock LOCAL (si no alcanza, no se
 * crea nada). Encargos y despacho a SM se disparan recién en `PAID` (`markPaid`).
 */

export class CheckoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CheckoutError";
  }
}

export type CreateOrderInput = {
  cart: CartCookie;
  zone: ShopZone;
  form: CheckoutForm;
  method: PaymentMethod;
  shippingCode: string;
  /** Cotización de CHECKOUT (con calle y número). Obligatoria fuera de MdP. */
  quote?: { quoteId: string | null; options: QuotedOption[]; agencyId?: string };
  now?: Date;
};

export type CreatedOrder = {
  id: string;
  code: string;
  trackingToken: string;
  total: number;
  method: PaymentMethod;
  paymentDueAt: Date;
};

export function paymentDueAt(method: PaymentMethod, now: Date): Date {
  const hours = method === "TRANSFER" ? config.transferHoldHours : config.mpHoldHours;
  return new Date(now.getTime() + hours * 3_600_000);
}

export async function createOrder(
  db: PrismaClient,
  input: CreateOrderInput,
): Promise<CreatedOrder> {
  const now = input.now ?? new Date();
  const products = await listPublishedByIds(
    db,
    input.cart.lines.map((l) => l.id),
  );
  const checkout = buildCheckout(input.cart, products, input.zone, input.quote?.options ?? []);
  if (checkout.lines.length === 0) {
    throw new CheckoutError("Tu pedido quedó vacío: los productos ya no están disponibles.");
  }
  const totals = checkoutTotals(checkout, input.shippingCode, input.method);
  if (!totals) throw new CheckoutError("Elegí una opción de envío.");

  const isCourier = input.shippingCode === COURIER_CODE;
  if (!isCourier) {
    if (!input.quote?.quoteId) {
      throw new CheckoutError("No pudimos confirmar el envío. Probá de nuevo en un momento.");
    }
    if (totals.choice.toAgency && !input.quote.agencyId) {
      throw new CheckoutError("Elegí la sucursal donde vas a retirar.");
    }
  }

  // Costo al momento (para la liquidación). DROPSHIP: oferta DROPSHIP; ENCARGO: oferta STOCK.
  const offers = await db.supplierOffer.findMany({
    where: { productId: { in: checkout.lines.map((l) => l.productId) }, supplier: "SM" },
    select: { productId: true, mode: true, cost: true },
  });
  const cost = (productId: string, source: string) =>
    source === "LOCAL"
      ? null
      : (offers.find(
          (o) =>
            o.productId === productId && o.mode === (source === "DROPSHIP" ? "DROPSHIP" : "STOCK"),
        )?.cost ?? null);

  const due = paymentDueAt(input.method, now);
  const f = input.form;

  for (let attempt = 0; ; attempt++) {
    const code = orderCode();
    const token = trackingToken();
    try {
      const order = await db.$transaction(async (tx) => {
        const created = await tx.order.create({
          data: {
            code,
            trackingToken: token,
            paymentMethod: input.method,
            status: "PENDING_PAYMENT",
            zone: input.zone.zone,
            subtotal: totals.subtotal,
            discount: totals.discount,
            shippingCharged: totals.shippingCharged,
            shippingCost: totals.shippingCost,
            total: totals.total,
            paymentDueAt: due,
            customerName: f.name,
            customerPhone: f.phone,
            customerEmail: f.email,
            street: f.street,
            streetNumber: f.number,
            floor: f.floor || null,
            locality: f.locality,
            postalCode: input.zone.cp,
            provinceId: f.provinceId ?? null,
            province: f.province,
            deliveryNotes: f.notes || null,
            deliverTogether: input.cart.together,
            shippingCode: input.shippingCode,
            quoteId: isCourier ? null : input.quote!.quoteId,
            agencyId: isCourier ? null : (input.quote!.agencyId ?? null),
            items: {
              create: checkout.lines.map((l) => ({
                productId: l.productId,
                quantity: l.quantity,
                unitPrice: l.unitPrice,
                source: l.source,
                unitCost: cost(l.productId, l.source),
              })),
            },
          },
          select: { id: true },
        });

        // Reserva atómica: solo si alcanza (físico − reservado ≥ cantidad). Evita sobreventa.
        for (const l of checkout.lines.filter((x) => x.source === "LOCAL")) {
          const n = await tx.$executeRaw`
            UPDATE "LocalStock" SET "reserved" = "reserved" + ${l.quantity}
            WHERE "productId" = ${l.productId} AND "quantity" - "reserved" >= ${l.quantity}`;
          if (n !== 1) {
            throw new CheckoutError(
              `Se agotó «${l.name}» mientras comprabas. Volvé al carrito para ajustar el pedido.`,
            );
          }
        }
        return created;
      });
      return {
        id: order.id,
        code,
        trackingToken: token,
        total: totals.total,
        method: input.method,
        paymentDueAt: due,
      };
    } catch (e) {
      // Choque de código (improbable): se reintenta con otro.
      if (attempt < 3 && e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        continue;
      }
      throw e;
    }
  }
}
