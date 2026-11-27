import {
  ENCARGO_STATUS_LABEL,
  ORDER_STATUS_LABEL,
  type EncargoStatus,
  type OrderStatus,
} from "../orders/transitions";
import { shippingLabel } from "./checkout";
import { formatMoney, pluralize } from "./format";

/**
 * Página del pedido (/pedido/[code]): confirmación + seguimiento (design/reference/
 * Tienda-Confirmacion y Tienda-Seguimiento). Pura. Nunca dice "encargo": lo que llega después se
 * nombra por plazo (docs/02).
 */

export type OrderForView = {
  code: string;
  status: OrderStatus;
  paymentMethod: "MP" | "TRANSFER";
  zone: "MDP" | "AMBA" | "INTERIOR";
  subtotal: number;
  discount: number;
  shippingCharged: number;
  total: number;
  paymentDueAt: Date | null;
  paymentProofUrl: string | null;
  trackingCode: string | null;
  shippingCode: string | null;
  deliverTogether: boolean;
  items: { name: string; quantity: number; source: "LOCAL" | "ENCARGO" | "DROPSHIP" }[];
  encargos: { status: EncargoStatus }[];
  /** Último estado de pago informado por MP (si hay). */
  lastMpStatus: string | null;
};

export type Step = { label: string; note: string; state: "done" | "now" | "todo" };

export type OrderView = {
  title: string;
  lead: string;
  badge: { cls: "b-ok" | "b-hoy" | "b-plazo" | "b-no"; text: string };
  /** Bloque de transferencia pendiente (monto, timer, datos, comprobante). */
  transfer: { amount: string; dueAt: string; proofSent: boolean } | null;
  /** Estado de MP mientras el pedido está pendiente. */
  mp: "waiting" | "rejected" | "ticket" | null;
  cancelled: boolean;
  steps: Step[];
  laterSteps: Step[] | null;
  groups: { title: string; lines: string[] }[];
  delivery: string;
  trackingCode: string | null;
  totals: { k: string; v: string }[];
  total: string;
};

const ORDER_FLOW: OrderStatus[] = ["PENDING_PAYMENT", "PAID", "FULFILLING", "SHIPPED", "DELIVERED"];
const ORDER_NOTE: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "Esperamos tu pago para seguir.",
  PAID: "Recibimos tu pago.",
  FULFILLING: "Armamos tu caja neutra.",
  SHIPPED: "Va en camino.",
  DELIVERED: "Tu pedido llegó.",
  CANCELLED: "",
};
const LATER_FLOW: Exclude<EncargoStatus, "CANCELADO">[] = [
  "PENDIENTE",
  "PEDIDO_A_PROVEEDOR",
  "RECIBIDO",
  "ENTREGADO",
];
const LATER_NOTE: Record<(typeof LATER_FLOW)[number], string> = {
  PENDIENTE: "Lo pedimos esta semana.",
  PEDIDO_A_PROVEEDOR: "Viaja hacia nosotros.",
  RECIBIDO: "Coordinamos la entrega con el cadete.",
  ENTREGADO: "Llegó.",
};

function steps<S extends string>(
  flow: S[],
  at: number,
  label: (s: S) => string,
  note: (s: S) => string,
): Step[] {
  return flow.map((s, i) => ({
    label: label(s),
    note: i === at ? note(s) : i < at ? "Listo" : "",
    state: i < at ? "done" : i === at ? "now" : "todo",
  }));
}

const dateFmt = new Intl.DateTimeFormat("es-AR", {
  timeZone: "America/Argentina/Buenos_Aires",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function buildOrderView(o: OrderForView): OrderView {
  const cancelled = o.status === "CANCELLED";
  const pending = o.status === "PENDING_PAYMENT";
  const transferPending = pending && o.paymentMethod === "TRANSFER";
  const mp: OrderView["mp"] =
    pending && o.paymentMethod === "MP"
      ? o.lastMpStatus === "rejected" || o.lastMpStatus === "cancelled"
        ? "rejected"
        : o.lastMpStatus === "pending" || o.lastMpStatus === "in_process"
          ? "ticket"
          : "waiting"
      : null;

  const at = ORDER_FLOW.indexOf(o.status);
  const later = o.items.filter((i) => i.source === "ENCARGO");
  const today = o.items.filter((i) => i.source === "LOCAL");
  const laterAt = Math.min(
    ...o.encargos
      .filter((e) => e.status !== "CANCELADO")
      .map((e) => LATER_FLOW.indexOf(e.status as never)),
  );

  const line = (i: OrderForView["items"][number]) => `${i.name} × ${i.quantity}`;
  const groups =
    o.zone !== "MDP"
      ? [{ title: "Tu envío", lines: o.items.map(line) }]
      : later.length && today.length && !o.deliverTogether
        ? [
            { title: "Tanda 1 · Hoy", lines: today.map(line) },
            { title: "Tanda 2 · Llega después", lines: later.map(line) },
          ]
        : [{ title: later.length ? "Tu entrega" : "Llega hoy", lines: o.items.map(line) }];

  const title = cancelled
    ? "Pedido cancelado"
    : transferPending
      ? "Falta tu transferencia"
      : mp === "rejected"
        ? "El pago no se aprobó"
        : pending
          ? "Estamos esperando tu pago"
          : o.status === "DELIVERED"
            ? "Tu pedido llegó"
            : o.status === "PAID"
              ? "¡Listo, recibimos tu pedido!"
              : "Tu pedido está en marcha";

  const lead = cancelled
    ? "Cancelamos el pedido y liberamos el stock. Si ya pagaste, escribinos con el comprobante."
    : transferPending
      ? "Reservamos tu pedido por 24 h. Cuando veamos el pago, lo despachamos."
      : mp === "rejected"
        ? "Mercado Pago no aprobó el pago. Podés intentar de nuevo con otro medio."
        : mp === "ticket"
          ? "Pagá el ticket en Rapipago o Pago Fácil antes de que venza. Reservamos tu pedido hasta entonces."
          : mp === "waiting"
            ? "Si ya pagaste, en unos minutos se actualiza esta página."
            : "Cada novedad te llega con un asunto neutro. Sin nombres de producto.";

  const badge: OrderView["badge"] = cancelled
    ? { cls: "b-no", text: "Cancelado" }
    : pending
      ? { cls: "b-plazo", text: ORDER_STATUS_LABEL.PENDING_PAYMENT }
      : o.status === "DELIVERED"
        ? { cls: "b-ok", text: ORDER_STATUS_LABEL.DELIVERED }
        : { cls: "b-hoy", text: ORDER_STATUS_LABEL[o.status] };

  const totals = [
    { k: "Subtotal", v: formatMoney(o.subtotal) },
    ...(o.discount ? [{ k: "Transferencia 10% OFF", v: formatMoney(-o.discount) }] : []),
    { k: "Envío", v: o.shippingCharged ? formatMoney(o.shippingCharged) : "Gratis" },
  ];

  return {
    title,
    lead,
    badge,
    transfer:
      transferPending && o.paymentDueAt
        ? {
            amount: formatMoney(o.total),
            dueAt: o.paymentDueAt.toISOString(),
            proofSent: Boolean(o.paymentProofUrl),
          }
        : null,
    mp,
    cancelled,
    steps: cancelled
      ? []
      : steps(
          ORDER_FLOW,
          at,
          (s) => ORDER_STATUS_LABEL[s],
          (s) => ORDER_NOTE[s],
        ),
    laterSteps:
      !cancelled && later.length && Number.isFinite(laterAt)
        ? steps(
            LATER_FLOW,
            laterAt,
            (s) => ENCARGO_STATUS_LABEL[s],
            (s) => LATER_NOTE[s],
          )
        : null,
    groups,
    delivery: o.shippingCode ? shippingLabel(o.shippingCode) : "",
    trackingCode: o.trackingCode,
    totals,
    total: formatMoney(o.total),
  };
}

/** "vence el 27 de noviembre, 14:05" (hora de Argentina). */
export function formatDue(iso: string): string {
  return dateFmt.format(new Date(iso));
}

export function itemsCount(o: Pick<OrderForView, "items">): string {
  return pluralize(
    o.items.reduce((a, i) => a + i.quantity, 0),
    "producto",
    "productos",
  );
}
