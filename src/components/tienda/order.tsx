"use client";

import { useActionState, useState, useSyncExternalStore } from "react";
import { type ProofState, uploadProofAction } from "@/app/(tienda)/pedido/[code]/actions";

/** Piezas interactivas de /pedido/[code]: cuenta regresiva, copiar y subir comprobante. */

function remaining(dueAt: string, now: number) {
  const ms = Math.max(0, Date.parse(dueAt) - now);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

/** Reloj de 1 s compartido; en el servidor (y antes de hidratar) no hay hora: `null`. */
const clock = {
  subscribe(cb: () => void) {
    const t = setInterval(cb, 1000);
    return () => clearInterval(t);
  },
  snapshot: () => Math.floor(Date.now() / 1000) * 1000,
  server: () => null,
};

export function Countdown({ dueAt, fallback }: { dueAt: string; fallback: string }) {
  const now = useSyncExternalStore(clock.subscribe, clock.snapshot, clock.server);
  // Sin JS (o antes de hidratar) se muestra la hora límite.
  return (
    <span className="font-mono text-[28px] font-semibold tabular-nums" aria-live="off">
      {now === null ? fallback : remaining(dueAt, now)}
    </span>
  );
}

export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="m-pill m-pill-ghost min-h-11 !px-4 !text-sm"
      aria-label={`Copiar ${label.toLowerCase()}`}
      onClick={async () => {
        await navigator.clipboard?.writeText(value).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      <span aria-live="polite">{copied ? "Copiado" : "Copiar"}</span>
    </button>
  );
}

export function ProofForm({ code, token, sent }: { code: string; token: string; sent: boolean }) {
  const [state, action, pending] = useActionState<ProofState, FormData>(uploadProofAction, {});
  if (state.ok || sent) {
    return (
      <p role="status" className="m-0 text-[15px] font-medium">
        Recibimos tu comprobante. Lo verificamos y despachamos.
      </p>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="code" value={code} />
      <input type="hidden" name="token" value={token} />
      <label className="c-label">
        Foto o PDF del comprobante
        <input
          type="file"
          name="proof"
          accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
          required
          className="t-input !py-3"
        />
      </label>
      <button type="submit" className="m-pill min-h-12" disabled={pending}>
        {pending ? "Subiendo…" : "Subir comprobante"}
      </button>
      {state.error && (
        <p role="alert" className="m-0 text-[13px] text-text-2">
          {state.error}
        </p>
      )}
    </form>
  );
}
