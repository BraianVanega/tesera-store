import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { CheckoutFlow } from "@/components/tienda/checkout";
import { deliveryGroups } from "@/lib/shop/checkout";
import { getProvinces, loadCheckout } from "@/lib/shop/checkout-server";
import { DISCRETE } from "@/lib/shop/constants";
import { formatMoney } from "@/lib/shop/format";
import { zoneLabel } from "@/lib/shop/session";

// Página sensible: título neutro, fuera de buscadores y sin analytics (docs/07).
export const metadata: Metadata = {
  title: { absolute: DISCRETE.neutralTitle },
  robots: { index: false, follow: false },
};

const wrap = "mx-auto w-full max-w-[720px] px-5";

export default function CheckoutPage() {
  return (
    <div className={`${wrap} flex flex-col gap-5 pt-6 pb-8 lg:pt-10`}>
      <div className="flex items-center justify-between gap-3">
        <h1 className="m-h2 lg:!text-[56px]">tu compra</h1>
        <span className="inline-flex items-center gap-2 text-[13px] text-text-2">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            aria-hidden="true"
          >
            <rect x="4" y="11" width="16" height="10" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
          Compra privada
        </span>
      </div>
      <Suspense fallback={<div className="min-h-[60vh]" aria-busy="true" />}>
        <Checkout />
      </Suspense>
    </div>
  );
}

async function Checkout() {
  const loaded = await loadCheckout();
  if (!loaded || loaded.checkout.lines.length === 0) redirect("/carrito");
  const { checkout, zone } = loaded;
  const isMdp = zone.zone === "MDP";
  const provinces = isMdp ? [] : await getProvinces();

  if (!isMdp && provinces.length === 0) {
    return (
      <div className="m-box flex flex-col gap-2">
        <p className="m-0 font-semibold">No podemos cotizar envíos en este momento</p>
        <p className="m-p !text-sm">Probá de nuevo en unos minutos. Tu carrito queda guardado.</p>
      </div>
    );
  }

  return (
    <CheckoutFlow
      cp={zone.cp}
      zoneLabel={zoneLabel(zone)}
      isMdp={isMdp}
      provinces={provinces}
      subtotal={formatMoney(checkout.subtotal)}
      groups={deliveryGroups(checkout)}
      twoBatches={checkout.twoBatches}
      leftOut={checkout.leftOut}
    />
  );
}
