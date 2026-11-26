"use client";

import Link from "next/link";
import { useActionState } from "react";
import { type AddState, addToCartAction } from "@/app/(tienda)/actions";

/** Agrega al carrito (cookie propia) vía server action; funciona sin JS. */
export function AddToCart({
  productId,
  label = "agregar al carrito",
  variant = "primary",
  ariaLabel,
}: {
  productId: string;
  label?: string;
  variant?: "primary" | "ghost";
  ariaLabel?: string;
}) {
  const [state, action, pending] = useActionState<AddState, FormData>(addToCartAction, {});
  const primary = variant === "primary";
  return (
    <form
      action={action}
      className={primary ? "flex flex-col gap-2" : "flex flex-col items-end gap-1"}
    >
      <input type="hidden" name="productId" value={productId} />
      <button
        type="submit"
        disabled={pending}
        aria-label={ariaLabel}
        className={primary ? "m-pill min-h-14 w-full text-base" : "m-pill m-pill-ghost"}
      >
        {pending ? "agregando…" : label}
      </button>
      <p aria-live="polite" className="m-0 text-sm text-text-2">
        {state.added &&
          (primary ? (
            <>
              Listo, está en tu pedido.{" "}
              <Link href="/carrito" className="t-link font-semibold text-text underline">
                ver carrito
              </Link>
            </>
          ) : (
            "agregado ✓"
          ))}
        {state.error}
      </p>
    </form>
  );
}
