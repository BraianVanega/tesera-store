import Link from "next/link";
import { Suspense } from "react";
import { CATEGORIES, categoryBySlug } from "@/lib/catalog/categories";
import { getCatalog, readZone } from "@/lib/shop/data";
import { pluralize } from "@/lib/shop/format";
import {
  type CatalogFilters,
  PRICE_RANGES,
  filterCatalog,
  priceRange,
  productBadge,
} from "@/lib/shop/view";
import { ProductCard, ProductGridSkeleton } from "./product";

type SP = Record<string, string | string[] | undefined>;

export function parseFilters(sp: SP): CatalogFilters {
  const precio = typeof sp.precio === "string" ? sp.precio : undefined;
  return { today: sp.hoy === "1", price: priceRange(precio)?.key };
}

/** URL de un filtro: conserva los demás. Sin filtros → URL canónica limpia. */
function hrefFor(base: string, f: CatalogFilters) {
  const q = new URLSearchParams();
  if (f.today) q.set("hoy", "1");
  if (f.price) q.set("precio", f.price);
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}

const wrap = "mx-auto w-full max-w-[1280px] px-5 lg:px-14";

/** Catálogo completo o de una categoría (todo menos el encabezado depende de la zona y los filtros). */
export function CatalogPage({
  category,
  searchParams,
}: {
  category?: string;
  searchParams: Promise<SP>;
}) {
  const cat = category ? categoryBySlug(category) : undefined;
  return (
    <>
      <section className={`${wrap} flex flex-col gap-3 pt-6 pb-2 lg:pt-10 lg:pb-4`}>
        <nav aria-label="Ruta" className="text-[13px] text-text-2 lg:text-sm">
          <Link href="/" className="t-link">
            Inicio
          </Link>{" "}
          /{" "}
          {cat ? (
            <>
              <Link href="/sex-shop" className="t-link">
                Sex shop
              </Link>{" "}
              / {cat.name}
            </>
          ) : (
            "Sex shop"
          )}
        </nav>
        <h1 className="m-h2 lg:!text-[72px]">{cat ? cat.name : "sex shop"}</h1>
        <p className="m-p lg:!text-[17px]">
          Elegí con calma. Los envíos son discretos, en caja neutra.
        </p>
      </section>
      <Suspense fallback={<CatalogFallback />}>
        <CatalogBody category={cat?.slug} searchParams={searchParams} />
      </Suspense>
    </>
  );
}

function CatalogFallback() {
  return (
    <div className={`${wrap} pt-6 pb-20 lg:grid lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-12`}>
      <div className="hidden lg:block" />
      <ProductGridSkeleton count={6} cols="grid-cols-2 lg:grid-cols-3" />
    </div>
  );
}

async function CatalogBody({
  category,
  searchParams,
}: {
  category?: string;
  searchParams: Promise<SP>;
}) {
  // Primero lo del request (cookies, query): así la base nunca se consulta durante el build.
  const [sp, zone] = await Promise.all([searchParams, readZone()]);
  const all = await getCatalog();
  const filters = parseFilters(sp);
  const inCategory = category ? all.filter((p) => p.category === category) : all;
  const products = filterCatalog(inCategory, filters, zone);
  const base = category ? `/sex-shop/${category}` : "/sex-shop";
  const showToday = zone?.zone === "MDP";

  const todayChip = showToday && (
    <Link
      href={hrefFor(base, { ...filters, today: !filters.today })}
      className="f-chip w-full justify-between lg:w-auto"
      aria-current={filters.today ? "true" : undefined}
      scroll={false}
    >
      <span>Entrega hoy en Mar del Plata</span>
      <span aria-hidden="true">{filters.today ? "✓" : ""}</span>
    </Link>
  );

  const categoryLinks = [{ slug: undefined, name: "Todo" }, ...CATEGORIES].map((c) => {
    const href = hrefFor(c.slug ? `/sex-shop/${c.slug}` : "/sex-shop", filters);
    const count = c.slug ? all.filter((p) => p.category === c.slug).length : all.length;
    return { ...c, href, count, current: c.slug === category };
  });

  const priceLinks = PRICE_RANGES.map((r) => ({
    ...r,
    current: filters.price === r.key,
    href: hrefFor(base, { ...filters, price: filters.price === r.key ? undefined : r.key }),
  }));

  return (
    <div
      className={`${wrap} pb-10 lg:grid lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-12 lg:pt-6 lg:pb-20`}
    >
      {/* Filtros: chips horizontales en mobile, columna en desktop */}
      <aside
        aria-label="Filtros"
        className="-mx-5 flex flex-col gap-3 border-b border-border pt-2 pb-4 lg:mx-0 lg:gap-7 lg:border-0 lg:p-0"
      >
        {todayChip && (
          <div className="flex flex-col gap-2.5 px-5 lg:px-0">
            <span className="hidden font-semibold lg:block">Entrega</span>
            {todayChip}
          </div>
        )}
        <nav
          aria-label="Categoría"
          className="flex gap-2 overflow-x-auto px-5 lg:flex-col lg:gap-0 lg:px-0"
        >
          <span className="mb-1 hidden font-semibold lg:block">Categoría</span>
          {categoryLinks.map((c) => (
            <Link
              key={c.name}
              href={c.href}
              aria-current={c.current ? "true" : undefined}
              className="f-chip lg:!min-h-10 lg:justify-between lg:rounded-none lg:!border-0 lg:!bg-transparent lg:px-0 lg:text-[15px] lg:!text-text-2 lg:aria-[current=true]:!text-text"
            >
              <span>{c.name}</span>
              <span className="hidden font-normal text-text-2 lg:inline">{c.count}</span>
            </Link>
          ))}
        </nav>
        <div
          role="group"
          aria-label="Precio"
          className="flex gap-2 overflow-x-auto px-5 lg:flex-col lg:items-start lg:px-0"
        >
          <span className="hidden font-semibold lg:block">Precio</span>
          {priceLinks.map((r) => (
            <Link
              key={r.key}
              href={r.href}
              aria-current={r.current ? "true" : undefined}
              className="f-chip"
              scroll={false}
            >
              {r.label}
            </Link>
          ))}
        </div>
      </aside>

      <section aria-label="Productos" className="pt-5 lg:pt-0">
        <p className="m-p mb-4 lg:mb-5" aria-live="polite">
          {pluralize(products.length, "producto", "productos")}
          {!zone && " · Elegí tu zona arriba para ver plazos de entrega"}
        </p>
        {products.length === 0 ? (
          <div className="m-box flex flex-col items-start gap-3">
            <p className="m-p">No hay productos con estos filtros.</p>
            <Link href={base} className="m-pill m-pill-ghost">
              ver todo
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-x-3 gap-y-6 lg:grid-cols-3 lg:gap-4 lg:gap-y-8">
            {products.map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                badge={productBadge(p, zone)}
                sizes="(min-width: 1024px) 30vw, 50vw"
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
