import Link from "next/link";
import { Suspense } from "react";
import { BagIcon } from "@/components/ui/icons";
import { CATEGORIES } from "@/lib/catalog/categories";
import { readCart, readZone } from "@/lib/shop/data";
import { cartUnits, zoneLabel } from "@/lib/shop/session";
import { DiscreteToggle } from "./discrete";
import { ZonePopover } from "./zone";

export const NAV = CATEGORIES.filter((c) => c.slug !== "anal");

export function Brand({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`brand ${className}`} aria-label="Inicio">
      <span className="brand-full">Tésera</span>
      <span className="brand-neutral">Tienda</span>
    </Link>
  );
}

export function AnnouncementBar() {
  return (
    <div className="bg-[var(--ann-bg)] px-5 py-2.5 text-center text-[13px] font-medium text-[var(--ann-fg)] lg:text-sm">
      <span className="lg:hidden">Caja 100% neutra · envío discreto a todo el país</span>
      <span className="hidden lg:inline">
        Caja 100% neutra · envío discreto a toda Argentina · 10% off pagando con transferencia
      </span>
    </div>
  );
}

export function Header() {
  return (
    <header className="bg-bg">
      <div className="mx-auto grid min-h-[60px] w-full max-w-[1280px] grid-cols-[auto_1fr_auto] items-center gap-1 pr-2 pl-5 lg:min-h-[76px] lg:grid-cols-[1fr_auto_1fr] lg:gap-6 lg:px-14">
        <Brand className="justify-self-start text-[19px] lg:text-[22px]" />
        <nav aria-label="Principal" className="hidden gap-7 lg:flex">
          <Link href="/sex-shop" className="t-link text-[15px] font-medium hover:text-accent">
            catálogo
          </Link>
          {NAV.map((c) => (
            <Link
              key={c.slug}
              href={`/sex-shop/${c.slug}`}
              className="t-link text-[15px] font-medium lowercase hover:text-accent"
            >
              {c.name}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-1 justify-self-end lg:gap-2">
          <Suspense fallback={<ZoneChipFallback />}>
            <ZoneChip />
          </Suspense>
          <DiscreteToggle />
          <Suspense fallback={<CartLink units={0} />}>
            <CartButton />
          </Suspense>
        </div>
      </div>
    </header>
  );
}

function ZoneChipFallback() {
  return <span className="inline-block min-h-11 w-24 rounded-full bg-surface" aria-hidden="true" />;
}

async function ZoneChip() {
  const zone = await readZone();
  if (!zone) return <ZonePopover label="Elegí tu zona" short="Tu CP" />;
  return <ZonePopover label={`${zoneLabel(zone)} · ${zone.cp}`} short={zone.cp} />;
}

async function CartButton() {
  return <CartLink units={cartUnits(await readCart())} />;
}

function CartLink({ units }: { units: number }) {
  const label =
    units === 0 ? "Carrito, vacío" : `Carrito, ${units} ${units === 1 ? "producto" : "productos"}`;
  return (
    <Link href="/carrito" className="m-icon-btn" aria-label={label}>
      <BagIcon />
      {units > 0 && <span className="m-count">{units}</span>}
    </Link>
  );
}
