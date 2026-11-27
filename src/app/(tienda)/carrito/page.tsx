import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Badge, ProductMedia } from "@/components/tienda/product";
import { ZoneForm } from "@/components/tienda/zone";
import { type CartItemView, buildCartView } from "@/lib/shop/cart-view";
import { getCartProducts, readCart, readZone } from "@/lib/shop/data";
import { pluralize } from "@/lib/shop/format";
import { DISCRETE } from "@/lib/shop/constants";
import { changeQtyAction, removeLineAction, setTogetherAction } from "../actions";

// Página sensible: título neutro y fuera de buscadores (docs/07).
export const metadata: Metadata = {
  title: { absolute: DISCRETE.neutralTitle },
  robots: { index: false, follow: false },
};

const wrap = "mx-auto w-full max-w-[720px] px-5";

export default function CartPage() {
  return (
    <div className="pb-8">
      <div className={`${wrap} flex flex-col gap-1.5 pt-6 lg:pt-10`}>
        <h1 className="m-h2 lg:!text-[56px]">tu pedido</h1>
      </div>
      <Suspense fallback={<div className={`${wrap} min-h-[50vh] pt-5`} aria-busy="true" />}>
        <Cart />
      </Suspense>
    </div>
  );
}

async function Cart() {
  const [cart, zone] = await Promise.all([readCart(), readZone()]);
  const products = await getCartProducts(cart.lines.map((l) => l.id));

  if (products.length === 0) {
    return (
      <div className={`${wrap} flex flex-col items-start gap-4 pt-4`}>
        <p className="m-p">Todavía no agregaste nada.</p>
        <Link href="/sex-shop" className="m-pill">
          ver catálogo
        </Link>
      </div>
    );
  }

  if (!zone) {
    return (
      <section aria-labelledby="h-cp" className={`${wrap} pt-5`}>
        <div className="m-box flex flex-col gap-3">
          <h2 id="h-cp" className="m-h3">
            ¿Dónde lo recibís?
          </h2>
          <p className="m-p">Con tu CP armamos las entregas y te mostramos qué llega hoy.</p>
          <ZoneForm />
        </div>
      </section>
    );
  }

  const v = buildCartView(cart, products, zone);

  return (
    <>
      <p className={`${wrap} m-p pt-1.5`}>{pluralize(v.units, "producto", "productos")}</p>

      <section aria-label="Envío gratis" className={`${wrap} pt-5`}>
        <div className="m-box flex flex-col gap-2.5">
          <span className="text-[15px] font-semibold" aria-live="polite">
            {v.freeShipping.text}
          </span>
          {v.freeShipping.kind === "bar" && (
            <>
              <div
                className="m-bar"
                role="progressbar"
                aria-label="Progreso hacia el envío gratis"
                aria-valuemin={0}
                aria-valuemax={v.freeShipping.threshold}
                aria-valuenow={v.freeShipping.base}
              >
                <span style={{ width: `${v.freeShipping.pct}%` }} />
              </div>
              <span className="text-xs text-text-2">{v.freeShipping.note}</span>
            </>
          )}
        </div>
      </section>

      {v.batches.map((b) => (
        <section
          key={b.key}
          aria-labelledby={`h-${b.key}`}
          className={`${wrap} flex flex-col gap-3 pt-6`}
        >
          <div className="flex items-center justify-between gap-3">
            <h2 id={`h-${b.key}`} className="m-h3">
              {b.title}
            </h2>
            <Badge badge={{ ...b.badge, available: true }} />
          </div>
          {b.note && <p className="m-p !text-[13px]">{b.note}</p>}
          {b.items.map((it) => (
            <CartItem key={`${b.key}-${it.product.id}`} item={it} />
          ))}
        </section>
      ))}

      {v.unavailable.length > 0 && (
        <section aria-labelledby="h-no" className={`${wrap} flex flex-col gap-3 pt-6`}>
          <h2 id="h-no" className="m-h3">
            No disponible en tu zona
          </h2>
          {v.unavailable.map((u) => (
            <div
              key={u.product.id}
              className="flex items-center justify-between gap-3 rounded-[20px] border border-dashed border-text-2 p-3.5"
            >
              <div className="flex min-w-0 flex-col">
                <span className="font-medium">{u.product.name}</span>
                <span className="text-[13px] text-text-2">
                  {u.partial
                    ? `${pluralize(u.quantity, "unidad", "unidades")} sin stock para tu zona. Ajustá la cantidad.`
                    : "No se vende en tu zona. No entra en el pedido."}
                </span>
              </div>
              {!u.partial && <RemoveButton productId={u.product.id} name={u.product.name} />}
            </div>
          ))}
        </section>
      )}

      {v.canDeliverTogether && (
        <section className={`${wrap} pt-4`}>
          <form action={setTogetherAction}>
            <input type="hidden" name="together" value={v.together ? "0" : "1"} />
            <button
              type="submit"
              role="switch"
              aria-checked={v.together}
              className="flex min-h-14 w-full items-center gap-3 rounded-[18px] bg-surface px-3.5 text-left text-[15px] font-medium"
            >
              <span
                aria-hidden="true"
                className="inline-flex size-[22px] flex-none items-center justify-center rounded-md border-[1.5px] border-text text-[15px] font-bold"
              >
                {v.together ? "✓" : ""}
              </span>
              Prefiero recibir todo junto
            </button>
          </form>
        </section>
      )}

      <section aria-labelledby="h-res" className={`${wrap} flex flex-col gap-3 pt-7`}>
        <h2 id="h-res" className="m-h3">
          Resumen
        </h2>
        <div className="m-row">
          <span className="m-row-k">Subtotal (precio de lista)</span>
          <span>{v.subtotal}</span>
        </div>
        <div className="m-row">
          <span className="m-row-k">Descuento por transferencia (10%)</span>
          <span>− {v.discount}</span>
        </div>
        <hr className="m-div" />
        <div className="m-row items-center">
          <span className="font-semibold">Total con transferencia</span>
          <span className="text-[22px] font-semibold">{v.totalTransfer}</span>
        </div>
        <div className="m-row">
          <span className="m-row-k">Total con Mercado Pago o tarjeta</span>
          <span>{v.totalList}</span>
        </div>
        <p className="m-0 text-xs text-text-2">
          El envío se elige en el siguiente paso, con precio y plazo.
        </p>
      </section>

      <section className={`${wrap} pt-6 pb-4`}>
        <div className="m-box flex flex-col gap-1.5">
          <span className="font-semibold">Tu compra es privada</span>
          <span className="m-p !text-sm">
            Caja 100% neutra, sin logos ni descripción del contenido. En tu resumen de tarjeta
            figura TESERA. Nadie sabe qué compraste.
          </span>
        </div>
      </section>

      <div className="sticky bottom-0 z-10 border-t border-border bg-bg py-3">
        <div className={wrap}>
          <Link
            href="/checkout"
            className={`m-pill min-h-12 w-full ${v.canCheckout ? "" : "pointer-events-none"}`}
            aria-disabled={!v.canCheckout || undefined}
          >
            Continuar con tus datos
          </Link>
        </div>
      </div>
    </>
  );
}

function CartItem({ item }: { item: CartItemView }) {
  const p = item.product;
  return (
    <div className="grid grid-cols-[84px_1fr] gap-3.5 rounded-[20px] bg-surface p-3">
      <Link href={`/producto/${p.slug}`} aria-label={p.name}>
        <ProductMedia product={p} aspect="aspect-square" sizes="84px" />
      </Link>
      <div className="flex min-w-0 flex-col gap-2">
        <Link href={`/producto/${p.slug}`} className="t-link text-[17px] leading-tight font-medium">
          {p.name}
        </Link>
        <span className="pr-lista">{item.unitPrice} c/u</span>
        {item.showStepper ? (
          <div className="flex items-center justify-between gap-2">
            <Stepper item={item} />
            <span className="font-semibold">{item.lineTotal}</span>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <span className="text-[13px] text-text-2">
              {pluralize(item.quantity, "unidad llega", "unidades llegan")} en esta tanda
            </span>
            <span className="font-semibold">{item.lineTotal}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function Stepper({ item }: { item: CartItemView }) {
  const name = item.product.name;
  return (
    <div className="p-stepper" role="group" aria-label={`Cantidad de ${name}`}>
      <form action={changeQtyAction}>
        <input type="hidden" name="productId" value={item.product.id} />
        <input type="hidden" name="delta" value="-1" />
        <button
          type="submit"
          aria-label={item.lineQty === 1 ? `Quitar ${name}` : "Quitar una unidad"}
        >
          −
        </button>
      </form>
      <output aria-live="polite">{item.lineQty}</output>
      <form action={changeQtyAction}>
        <input type="hidden" name="productId" value={item.product.id} />
        <input type="hidden" name="delta" value="1" />
        <button type="submit" aria-label="Agregar una unidad" disabled={!item.canAdd}>
          +
        </button>
      </form>
    </div>
  );
}

function RemoveButton({ productId, name }: { productId: string; name: string }) {
  return (
    <form action={removeLineAction}>
      <input type="hidden" name="productId" value={productId} />
      <button
        type="submit"
        className="m-pill m-pill-ghost min-h-11 px-4 text-sm"
        aria-label={`Quitar ${name}`}
      >
        quitar
      </button>
    </form>
  );
}
