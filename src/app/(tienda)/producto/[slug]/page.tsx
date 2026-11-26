import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AddToCart } from "@/components/tienda/add-to-cart";
import { Badge, ProductMedia } from "@/components/tienda/product";
import { ZoneForm } from "@/components/tienda/zone";
import { TruckIcon } from "@/components/ui/icons";
import { categoryBySlug } from "@/lib/catalog/categories";
import type { CatalogProduct } from "@/lib/catalog/queries";
import { availability } from "@/lib/domain/availability";
import { getCatalog, getCatalogProduct, readZone } from "@/lib/shop/data";
import { formatMoney } from "@/lib/shop/format";
import { deliveryNote, priceView, productBadge } from "@/lib/shop/view";

type Props = PageProps<"/producto/[slug]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await getCatalogProduct((await params).slug);
  if (!p) return {};
  const cat = categoryBySlug(p.category);
  return {
    title: `${p.name}${cat ? ` · ${cat.name}` : ""}`,
    description: `${p.name}${p.description ? `: ${p.description}` : ""}. Sex shop online con envío discreto en caja neutra y 10% OFF por transferencia.`,
    alternates: { canonical: `/producto/${p.slug}` },
  };
}

const PRIVACY = [
  "Caja 100% neutra, sin logos ni descripción del contenido.",
  "En el resumen de tu tarjeta figura TESERA.",
  "Nadie sabe qué compraste.",
];

export default function ProductPage({ params }: Props) {
  return (
    <Suspense fallback={<div className="min-h-[80vh]" />}>
      <Product params={params} />
    </Suspense>
  );
}

async function Product({ params }: Pick<Props, "params">) {
  const p = await getCatalogProduct((await params).slug);
  if (!p) notFound();
  const cat = categoryBySlug(p.category);
  const thumbs = p.images.length > 1 ? p.images.slice(0, 4) : [];

  return (
    <>
      <section className="mx-auto grid w-full max-w-[1280px] gap-6 px-5 pt-4 pb-8 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:items-start lg:gap-16 lg:px-14 lg:pt-8 lg:pb-16">
        <nav aria-label="Ruta" className="text-[13px] text-text-2 lg:hidden">
          <Link href={cat ? `/sex-shop/${cat.slug}` : "/sex-shop"} className="t-link">
            ← {cat?.name ?? "Catálogo"}
          </Link>
        </nav>

        <div
          className={
            thumbs.length ? "grid gap-2.5 lg:grid-cols-[96px_minmax(0,1fr)] lg:gap-3.5" : ""
          }
        >
          <div className="lg:order-2">
            <ProductMedia
              product={p}
              aspect="aspect-square lg:aspect-[4/5]"
              sizes="(min-width: 1024px) 50vw, 100vw"
              priority
            />
          </div>
          {thumbs.length > 0 && (
            <div className="grid grid-cols-4 gap-2 lg:order-1 lg:flex lg:flex-col lg:gap-2.5">
              {thumbs.map((_, i) => (
                <ProductMedia key={i} product={p} image={i} aspect="aspect-square" sizes="96px" />
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4 lg:sticky lg:top-6 lg:gap-5">
          <nav aria-label="Ruta" className="hidden text-sm text-text-2 lg:block">
            <Link href="/" className="t-link">
              Inicio
            </Link>{" "}
            /{" "}
            <Link href={cat ? `/sex-shop/${cat.slug}` : "/sex-shop"} className="t-link">
              {cat?.name ?? "Catálogo"}
            </Link>
          </nav>
          <Suspense fallback={<span className="h-[26px]" />}>
            <ZoneBadge product={p} />
          </Suspense>
          <h1 className="m-h2 lg:!text-[64px]">{p.name}</h1>
          {p.description && <p className="m-p lg:!text-[17px]">{p.description}</p>}
          <Suspense fallback={<PriceBox price={p.price} />}>
            <Purchase product={p} />
          </Suspense>
          <ul className="m-0 flex list-none flex-col gap-3 border-t border-border p-0 pt-5 text-[15px]">
            {PRIVACY.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      </section>
      <Suspense>
        <AddOns product={p} />
      </Suspense>
    </>
  );
}

async function ZoneBadge({ product }: { product: CatalogProduct }) {
  const badge = productBadge(product, await readZone());
  return <Badge badge={badge} className="self-start" />;
}

function PriceBox({ price }: { price: number }) {
  const v = priceView(price);
  return (
    <div className="m-box flex flex-col gap-2">
      <span className="flex flex-wrap items-center gap-3.5">
        <span className="text-[28px] leading-none font-semibold tracking-[-0.02em] lg:text-[40px]">
          {v.transfer}
        </span>
        <span className="pr-off">10% OFF</span>
      </span>
      <span className="text-sm text-text-2">pagando con transferencia</span>
      <hr className="m-div my-1.5" />
      <span className="text-[15px]">{v.list} con Mercado Pago o tarjeta</span>
    </div>
  );
}

async function Purchase({ product }: { product: CatalogProduct }) {
  const zone = await readZone();
  const badge = productBadge(product, zone);
  const note = deliveryNote(badge, zone);
  return (
    <>
      {badge.available ? (
        <PriceBox price={product.price} />
      ) : (
        <div className="m-box">
          <p className="m-p">Este producto no se vende en tu zona.</p>
        </div>
      )}
      <div className="flex items-start gap-3.5">
        <TruckIcon className="mt-0.5 flex-none" />
        <div className="flex flex-col gap-0.5">
          <span className="font-semibold">{note.title}</span>
          <span className="m-p !text-sm">{note.text}</span>
        </div>
      </div>
      {!zone && <ZoneForm surface="surface" />}
      {badge.available && <AddToCart productId={product.id} />}
    </>
  );
}

/** "Agregalo a tu pedido": consumibles con stock local, solo en MdP (llegan juntos hoy). */
async function AddOns({ product }: { product: CatalogProduct }) {
  const zone = await readZone();
  if (zone?.zone !== "MDP") return null;
  const addons = (await getCatalog("lubricantes"))
    .filter((p) => p.id !== product.id && p.availabilityInput.isConsumable)
    .filter((p) => {
      const a = availability(p.availabilityInput, "MDP");
      return a.available && a.source === "LOCAL";
    })
    .slice(0, 2);
  if (addons.length === 0) return null;
  return (
    <section
      aria-labelledby="h-add"
      className="mx-auto flex w-full max-w-[1280px] flex-col gap-3.5 px-5 pb-10 lg:gap-5 lg:px-14 lg:pb-20"
    >
      <h2 id="h-add" className="m-h2 !text-2xl lg:!text-[40px]">
        agregalo a tu pedido
      </h2>
      <p className="m-p">
        Se entregan juntos, hoy en Mar del Plata. Los consumibles solo se venden acá.
      </p>
      <div className="grid gap-3 lg:grid-cols-2 lg:gap-4">
        {addons.map((a) => (
          <div
            key={a.id}
            className="grid grid-cols-[72px_1fr_auto] items-center gap-3 rounded-[22px] bg-surface p-2.5 lg:grid-cols-[112px_1fr_auto] lg:gap-[18px] lg:p-3.5"
          >
            <Link href={`/producto/${a.slug}`} aria-label={a.name}>
              <ProductMedia product={a} aspect="aspect-square !bg-bg" sizes="112px" />
            </Link>
            <div className="flex min-w-0 flex-col gap-0.5">
              <Link href={`/producto/${a.slug}`} className="t-link text-[15px] font-semibold">
                {a.name}
              </Link>
              <span className="m-p !text-sm">{formatMoney(a.price)}</span>
            </div>
            <AddToCart
              productId={a.id}
              label="agregar"
              variant="ghost"
              ariaLabel={`Agregar ${a.name}`}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
