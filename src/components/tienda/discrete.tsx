"use client";

import { useSyncExternalStore } from "react";
import { CloseIcon, EyeIcon } from "@/components/ui/icons";
import { discreteGuard } from "@/lib/discrete/guard";
import { COOKIES, COOKIE_MAX_AGE, DISCRETE } from "@/lib/shop/constants";

// El estado vive en <html data-theme> (lo pone el script inline antes de pintar); acá solo se lee.
function subscribe(onChange: () => void) {
  const obs = new MutationObserver(onChange);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => obs.disconnect();
}
const isDiscrete = () => document.documentElement.getAttribute("data-theme") === "discreto";

export function useDiscrete(): boolean {
  return useSyncExternalStore(subscribe, isDiscrete, () => false);
}

function writeCookie(name: string, value: string | null) {
  const secure = location.protocol === "https:" ? "; secure" : "";
  document.cookie =
    value === null
      ? `${name}=; path=/; max-age=0; samesite=lax${secure}`
      : `${name}=${value}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax${secure}`;
}

/** Ojo del header: prende/apaga el modo discreto. La cookie es propia y no sale del sitio. */
export function DiscreteToggle() {
  const on = useDiscrete();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label="Modo discreto"
      title="Modo discreto"
      className="m-icon-btn"
      onClick={() => {
        writeCookie(COOKIES.discrete, on ? null : "1");
        discreteGuard(!on, DISCRETE.neutralTitle);
      }}
    >
      <EyeIcon slashed={on} />
    </button>
  );
}

/** "Salir ya": borra carrito y zona y se va a un sitio neutro sin dejar esta página en el historial. */
export function ExitNow() {
  return (
    <button
      type="button"
      className="m-pill only-discreto fixed right-4 bottom-4 z-50 min-h-12 shadow-lg"
      onClick={() => {
        writeCookie(COOKIES.cart, null);
        writeCookie(COOKIES.zone, null);
        try {
          sessionStorage.clear();
        } catch {}
        location.replace(DISCRETE.exitUrl);
      }}
    >
      <CloseIcon />
      Salir ya
    </button>
  );
}
