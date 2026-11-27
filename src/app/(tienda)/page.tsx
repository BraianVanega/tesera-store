import Link from "next/link";
import { Suspense } from "react";
import { Hero } from "@/components/tienda/hero";
import { ProductCard, ProductGridSkeleton } from "@/components/tienda/product";
import { Ticker } from "@/components/tienda/ticker";
import { ZoneForm } from "@/components/tienda/zone";
import { PinIcon } from "@/components/ui/icons";
import { CATEGORIES, isCategory } from "@/lib/catalog/categories";
import { getCatalog, readZone } from "@/lib/shop/data";
import { zoneLabel } from "@/lib/shop/session";
import { productBadge, shippingCopy } from "@/lib/shop/view";

const CATEGORY_NOTES: Record<string, string> = {
  succionadores: "estimulación suave",
  vibradores: "para vos o en compañía",
  anal: "para empezar con calma",
  lubricantes: "solo Mar del Plata",
  lenceria: "cómoda y linda",
  kits: "todo en una caja",
};

const TABS = [
  { key: undefined, label: "más elegidos" },
  { key: "succionadores", label: "succionadores" },
  { key: "vibradores", label: "vibradores" },
  { key: "lubricantes", label: "lubricantes" },
  { key: "kits", label: "kits" },
] as const;

const DISCRETION = [
  { title: "Caja 100% neutra", text: "Sin logos ni descripción del contenido." },
  { title: "En tu resumen figura TESERA", text: "Así aparece el cargo en tu tarjeta o banco." },
  {
    title: "Modo discreto",
    text: "Con un toque en el ojo, la tienda se ve oscura y neutra, con fotos difuminadas.",
  },
];

const wrap = "mx-auto w-full max-w-[1280px] px-5 lg:px-14";

export default function Home({ searchParams }: PageProps<"/">) {
  return (
    <>
      <Hero />
      <Ticker />
      <Suspense fallback={<div className="h-[76px]" />}>
        <ZoneBar />
      </Suspense>

      <section aria-labelledby="h-top" className={`${wrap} pt-10 pb-2 lg:pt-20 lg:pb-6`}>
        <div className="mb-5 flex flex-col gap-3.5 lg:mb-9 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-3.5 lg:gap-[18px]">
            <h2 id="h-top" className="m-h2 lg:!text-[56px]">
              lo más elegido
            </h2>
            <Suspense fallback={<Tabs active={undefined} />}>
              <TabsFromParams searchParams={searchParams} />
            </Suspense>
          </div>
          <Link href="/sex-shop" className="m-pill m-pill-ghost hidden lg:inline-flex">
            ver todo
          </Link>
        </div>
        <Suspense fallback={<ProductGridSkeleton />}>
          <TopProducts searchParams={searchParams} />
        </Suspense>
        <Link href="/sex-shop" className="m-pill m-pill-ghost mt-6 w-full lg:hidden">
          ver todo el catálogo
        </Link>
      </section>

      <section aria-labelledby="h-cat" className={`${wrap} pt-10 pb-2 lg:pt-[72px] lg:pb-6`}>
        <h2 id="h-cat" className="m-h2 mb-5 lg:mb-9 lg:!text-[56px]">
          elegí por categoría
        </h2>
        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-3 lg:gap-4">
          {CATEGORIES.map((c) => (
            <Link
              key={c.slug}
              href={`/sex-shop/${c.slug}`}
              className={`${c.silhouette} block text-[#f7efe6] no-underline`}
            >
              <div className="m-ph aspect-[4/5] lg:aspect-[4/3]">
                <div className="m-ph-in" />
                <div className="absolute inset-x-0 bottom-0 flex flex-col gap-0.5 bg-gradient-to-b from-transparent to-[rgba(20,10,8,0.8)] px-3.5 pt-10 pb-3.5 lg:px-6 lg:pt-14 lg:pb-[22px]">
                  <span className="text-xl font-medium tracking-[-0.02em] lowercase lg:text-[28px]">
                    {c.name}
                  </span>
                  <span className="text-xs opacity-90 lg:text-sm">{CATEGORY_NOTES[c.slug]}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <div className="mt-10 grid lg:mt-[72px] lg:grid-cols-2">
        <section aria-label="Envíos" className="t-dark bg-dark text-text">
          <div className="flex h-full flex-col justify-center gap-3.5 px-5 py-10 lg:ml-auto lg:max-w-[640px] lg:gap-[18px] lg:px-14 lg:py-20">
            <Suspense fallback={<ShippingBand copy={shippingCopy(null)} />}>
              <ShippingBandForZone />
            </Suspense>
          </div>
        </section>

        <section id="discrecion" aria-labelledby="h-disc" className="sh-glow relative scroll-mt-4">
          <div className="flex flex-col gap-[22px] px-5 pt-14 pb-12 text-[#f7efe6] lg:max-w-[640px] lg:px-14 lg:py-20">
            <p className="m-eyebrow !text-[#f7efe6]">tu privacidad</p>
            <h2 id="h-disc" className="m-hero !text-[44px] text-[#f7efe6] lg:!text-[64px]">
              nadie sabe
              <br />
              qué compraste.
            </h2>
            <div className="flex flex-col gap-3 lg:max-w-[460px] lg:gap-2.5">
              {DISCRETION.map((d) => (
                <div
                  key={d.title}
                  className="flex flex-col gap-0.5 rounded-[18px] bg-[rgba(20,10,8,0.5)] px-[18px] py-4 lg:px-5"
                >
                  <h3 className="m-h3 !text-[#f7efe6]">{d.title}</h3>
                  <p className="m-0 text-sm leading-[1.45] text-[#e7d9cb]">{d.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </>
  );
}

async function ZoneBar() {
  const zone = await readZone();
  if (!zone) {
    return (
      <section aria-labelledby="h-zona" className={`${wrap} pt-6 lg:max-w-[720px]`}>
        <div className="m-box flex flex-col gap-3">
          <h2 id="h-zona" className="m-h3">
            ¿Estás en Mar del Plata?
          </h2>
          <p className="m-p">
            Ingresá tu CP y recibí hoy. Te mostramos entrega y envío según tu zona.
          </p>
          <ZoneForm />
        </div>
      </section>
    );
  }
  return (
    <section aria-label="Zona de entrega" className={`${wrap} pt-5 lg:hidden`}>
      <p className="m-0 flex min-h-[52px] items-center gap-2.5 rounded-full bg-surface px-[18px] text-sm font-medium">
        <PinIcon />
        <span className="flex-1">
          Entrega en {zoneLabel(zone)} · CP {zone.cp}
        </span>
        <span className="text-text-2">cambialo arriba</span>
      </p>
    </section>
  );
}

function activeTab(sp: Record<string, string | string[] | undefined>) {
  const v = typeof sp.ver === "string" ? sp.ver : undefined;
  return v && isCategory(v) ? v : undefined;
}

async function TabsFromParams({ searchParams }: Pick<PageProps<"/">, "searchParams">) {
  return <Tabs active={activeTab(await searchParams)} />;
}

function Tabs({ active }: { active: string | undefined }) {
  return (
    <nav
      aria-label="Categorías"
      className="-mx-5 flex gap-[22px] overflow-x-auto px-5 lg:mx-0 lg:gap-8 lg:px-0"
    >
      {TABS.map((t) => (
        <Link
          key={t.label}
          href={t.key ? `/?ver=${t.key}#h-top` : "/#h-top"}
          scroll={false}
          className="h-tab"
          aria-current={t.key === active ? "true" : undefined}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

async function TopProducts({ searchParams }: Pick<PageProps<"/">, "searchParams">) {
  const [sp, zone] = await Promise.all([searchParams, readZone()]);
  const tab = activeTab(sp);
  // TODO(fase-6): "más elegidos" por ventas reales; hoy son los últimos publicados.
  const products = (await getCatalog(tab)).slice(0, tab ? 8 : 4);
  if (products.length === 0) {
    return <p className="m-p">Pronto vas a encontrar productos acá.</p>;
  }
  return (
    <>
      <p className="m-p mb-4">
        {zone
          ? "Precio con transferencia: 10% off."
          : "Elegí tu zona para ver disponibilidad y envío."}
      </p>
      <div className="-mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-2 lg:mx-0 lg:grid lg:grid-cols-4 lg:gap-4 lg:overflow-visible lg:px-0">
        {products.map((p) => (
          <ProductCard
            key={p.id}
            product={p}
            badge={productBadge(p, zone)}
            className="w-[276px] flex-none snap-start lg:w-auto"
          />
        ))}
      </div>
    </>
  );
}

async function ShippingBandForZone() {
  return <ShippingBand copy={shippingCopy(await readZone())} />;
}

function ShippingBand({ copy }: { copy: ReturnType<typeof shippingCopy> }) {
  return (
    <>
      <p className="m-eyebrow">{copy.eyebrow}</p>
      <h2 className="m-h2 !text-[40px] lg:!text-[64px]">{copy.title}</h2>
      <p className="m-0 max-w-[36ch] text-base leading-normal text-text-2 lg:text-lg">
        {copy.text}
      </p>
    </>
  );
}
