"use client";

import { useActionState, useEffect, useId, useRef } from "react";
import { setZoneAction, type ZoneState } from "@/app/(tienda)/actions";

/** Formulario de CP. Guarda la zona en la cookie propia `tsr_zona` (server action). */
export function ZoneForm({
  onDone,
  autoFocus = false,
  surface = "bg",
}: {
  onDone?: () => void;
  autoFocus?: boolean;
  surface?: "bg" | "surface";
}) {
  const [state, action, pending] = useActionState<ZoneState, FormData>(setZoneAction, {});
  const id = useId();
  useEffect(() => {
    if (state.ok) onDone?.();
  }, [state, onDone]);
  return (
    <form action={action} className="flex flex-col gap-2">
      <div className="flex gap-2">
        <label htmlFor={id} className="sr-only">
          Código postal
        </label>
        <input
          id={id}
          name="cp"
          className="t-input flex-1"
          style={{ background: `var(--${surface})` }}
          inputMode="numeric"
          autoComplete="postal-code"
          placeholder="Tu CP, por ej. 7600"
          maxLength={12}
          required
          autoFocus={autoFocus}
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? `${id}-err` : undefined}
        />
        <button type="submit" className="m-pill" disabled={pending}>
          {pending ? "…" : "ver"}
        </button>
      </div>
      {state.error && (
        <p id={`${id}-err`} role="alert" className="m-0 text-[13px] text-text-2">
          {state.error}
        </p>
      )}
    </form>
  );
}

/** Popover del chip de zona: <details> nativo (funciona sin JS), se cierra al guardar. */
export function ZonePopover({ label, short }: { label: string; short: string }) {
  const ref = useRef<HTMLDetailsElement>(null);
  return (
    <details ref={ref} className="group relative">
      <summary
        aria-label={`Zona de entrega: ${label}. Cambiar`}
        className="inline-flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-full bg-surface px-3.5 text-[13px] font-medium lg:px-4 lg:text-sm [&::-webkit-details-marker]:hidden"
      >
        <PinGlyph />
        <span className="sm:hidden">{short}</span>
        <span className="hidden sm:inline">{label}</span>
      </summary>
      <div className="absolute right-0 z-40 mt-2 flex w-[min(320px,calc(100vw-24px))] flex-col gap-3 rounded-[20px] bg-surface p-4 shadow-xl">
        <p className="m-0 text-sm font-semibold">¿Dónde lo recibís?</p>
        <p className="m-p !text-sm">Con tu CP te mostramos entrega y envío según tu zona.</p>
        <ZoneForm autoFocus onDone={() => ref.current?.removeAttribute("open")} />
      </div>
    </details>
  );
}

function PinGlyph() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </svg>
  );
}
