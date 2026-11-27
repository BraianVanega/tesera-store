import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CopyButton, Countdown, ProofForm } from "@/components/tienda/order";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { ORDER_CODE_RE, safeTokenEqual } from "@/lib/orders/code";
import { DISCRETE } from "@/lib/shop/constants";
import { buildOrderView, formatDue, type Step } from "@/lib/shop/order-view";
import { retryMpAction } from "./actions";

// Página sensible: título neutro, fuera de buscadores y sin analytics (docs/07).
export const metadata: Metadata = {
  title: { absolute: DISCRETE.neutralTitle },
  robots: { index: false, follow: false },
};

const wrap = "mx-auto w-full max-w-[720px] px-5";

export default function OrderPage(props: PageProps<"/pedido/[code]">) {
  return (
    <div className={`${wrap} flex flex-col gap-6 pt-6 pb-10 lg:pt-10`}>
      <Suspense fallback={<div className="min-h-[60vh]" aria-busy="true" />}>
        <Order {...props} />
      </Suspense>
    </div>
  );
}

async function Order({ params, searchParams }: PageProps<"/pedido/[code]">) {
  const [{ code }, sp] = await Promise.all([params, searchParams]);
  const token = typeof sp.t === "string" ? sp.t : null;
  if (!ORDER_CODE_RE.test(code) || !token) notFound();

  const order = await db().order.findUnique({
    where: { code },
    include: {
      items: { include: { product: { select: { name: true } } } },
      encargos: { select: { status: true } },
      paymentEvents: {
        where: { provider: "MP" },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { status: true },
      },
    },
  });
  // Mismo 404 si no existe o si el token no coincide: no se confirma que el código exista.
  if (!order || !safeTokenEqual(token, order.trackingToken)) notFound();

  const v = buildOrderView({
    ...order,
    items: order.items.map((i) => ({
      name: i.product.name,
      quantity: i.quantity,
      source: i.source,
    })),
    lastMpStatus: order.paymentEvents[0]?.status ?? null,
  });
  const e = env();
  const account = [
    ["Titular", e.TRANSFER_HOLDER],
    ["CBU / CVU", e.TRANSFER_CBU],
    ["Alias", e.TRANSFER_ALIAS],
  ].filter((r): r is [string, string] => Boolean(r[1]));
  const whatsapp = e.WHATSAPP_NUMBER
    ? `https://wa.me/${e.WHATSAPP_NUMBER}?text=${encodeURIComponent(`Hola, te mando el comprobante del pedido ${order.code}.`)}`
    : null;

  return (
    <>
      <header className="flex flex-col gap-3">
        <span className="m-p !text-sm">Pedido {order.code}</span>
        <span className={`b ${v.badge.cls} self-start`}>{v.badge.text}</span>
        <h1 className="m-h2 lg:!text-[56px]">{v.title.toLowerCase()}</h1>
        <p className="m-p">{v.lead}</p>
      </header>

      {v.transfer && (
        <section aria-labelledby="h-tr" className="flex flex-col gap-4">
          <div className="m-box flex flex-col gap-2">
            <h2 id="h-tr" className="m-0 text-sm font-medium text-text-2">
              Monto exacto a transferir
            </h2>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-[34px] font-semibold">{v.transfer.amount}</span>
              <CopyButton value={String(order.total)} label="Monto" />
            </div>
            {order.discount > 0 && <span className="pr-off self-start">10% OFF aplicado</span>}
          </div>
          <div className="m-box flex flex-col gap-1.5">
            <span className="text-sm font-medium text-text-2">Tiempo para pagar</span>
            <Countdown
              dueAt={v.transfer.dueAt}
              fallback={`hasta el ${formatDue(v.transfer.dueAt)}`}
            />
            <span className="m-p !text-sm">
              Si pasan 24 h sin el pago, el pedido se cancela y liberamos el stock.
            </span>
          </div>
          <div className="m-box flex flex-col gap-3">
            <h3 className="m-h3">Datos para transferir</h3>
            {account.length ? (
              account.map(([k, val]) => (
                <div key={k} className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 flex-col">
                    <span className="text-xs text-text-2">{k}</span>
                    <span className="font-medium break-all">{val}</span>
                  </div>
                  <CopyButton value={val} label={k} />
                </div>
              ))
            ) : (
              // TODO(brai): datos reales de la cuenta en TRANSFER_* (solo en Vercel).
              <p className="m-p !text-sm">Te pasamos los datos por WhatsApp.</p>
            )}
            <p className="m-0 text-xs text-text-2">
              En tu banco va a figurar el nombre del titular de la cuenta, no el de la tienda. Tu
              compra queda privada.
            </p>
          </div>
          <div className="m-box flex flex-col gap-3">
            <h3 className="m-h3">Ya transferiste</h3>
            <p className="m-p !text-sm">Mandanos el comprobante. Lo verificamos y despachamos.</p>
            <ProofForm code={order.code} token={token} sent={v.transfer.proofSent} />
            {whatsapp && (
              <a
                href={whatsapp}
                className="m-pill m-pill-ghost min-h-12"
                rel="noopener noreferrer"
                target="_blank"
              >
                Enviarlo por WhatsApp
              </a>
            )}
          </div>
        </section>
      )}

      {v.mp === "rejected" || v.mp === "waiting" ? (
        <form action={retryMpAction} className="m-box flex flex-col gap-3">
          <input type="hidden" name="code" value={order.code} />
          <input type="hidden" name="token" value={token} />
          <p className="m-p !text-sm">
            {v.mp === "rejected"
              ? "Tu pedido sigue reservado un rato más."
              : "¿Cerraste Mercado Pago antes de pagar? Podés volver a intentarlo."}
          </p>
          <button type="submit" className="m-pill min-h-12">
            Pagar con Mercado Pago
          </button>
        </form>
      ) : null}

      {v.cancelled && (
        <Link href="/sex-shop" className="m-pill self-start">
          Volver a armar mi pedido
        </Link>
      )}

      {v.steps.length > 0 && (
        <section aria-labelledby="h-st" className="flex flex-col gap-4">
          <h2 id="h-st" className="m-h3">
            Estado del pedido
          </h2>
          <Timeline steps={v.steps} />
          {v.trackingCode && (
            <div className="m-box flex items-center justify-between gap-3">
              <div className="flex flex-col">
                <span className="text-xs text-text-2">Código de seguimiento</span>
                <span className="font-medium">{v.trackingCode}</span>
              </div>
              <CopyButton value={v.trackingCode} label="Código de seguimiento" />
            </div>
          )}
        </section>
      )}

      {v.laterSteps && (
        <section aria-labelledby="h-later" className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <h2 id="h-later" className="m-h3">
              Llega después
            </h2>
            <span className="b b-plazo">5 a 10 días</span>
          </div>
          <Timeline steps={v.laterSteps} />
        </section>
      )}

      <section aria-labelledby="h-det" className="m-box flex flex-col gap-2.5">
        <h2 id="h-det" className="m-h3">
          Tu pedido
        </h2>
        {v.groups.map((g) => (
          <div key={g.title} className="flex flex-col gap-0.5 text-sm">
            <span className="font-semibold">{g.title}</span>
            {g.lines.map((l) => (
              <span key={l} className="text-text-2">
                {l}
              </span>
            ))}
          </div>
        ))}
        {v.delivery && (
          <div className="m-row">
            <span className="m-row-k">Entrega</span>
            <span>{v.delivery}</span>
          </div>
        )}
        <hr className="m-div" />
        {v.totals.map((t) => (
          <div key={t.k} className="m-row">
            <span className="m-row-k">{t.k}</span>
            <span>{t.v}</span>
          </div>
        ))}
        <div className="m-row items-center">
          <span className="font-semibold">Total</span>
          <span className="text-[22px] font-semibold">{v.total}</span>
        </div>
      </section>

      <section className="m-box flex flex-col gap-1.5">
        <span className="font-semibold">Avisos privados</span>
        <span className="m-p !text-sm">
          Guardá este link para seguir tu pedido. Cada novedad llega con un asunto neutro, sin
          nombres de producto.
        </span>
      </section>
    </>
  );
}

function Timeline({ steps }: { steps: Step[] }) {
  return (
    <ol className="m-tl">
      {steps.map((s) => (
        <li key={s.label} className={s.state} aria-current={s.state === "now" ? "step" : undefined}>
          <span className="m-dot" aria-hidden="true">
            {s.state === "done" ? "✓" : ""}
          </span>
          <span className="flex flex-col gap-0.5">
            <span className={s.state === "todo" ? "text-text-2" : "font-semibold"}>{s.label}</span>
            {s.note && <span className="text-sm text-text-2">{s.note}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}
