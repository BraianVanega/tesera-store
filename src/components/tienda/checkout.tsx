"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import {
  type AgencyView,
  agenciesAction,
  type ChoiceView,
  type FieldErrors,
  placeOrderAction,
  type PlaceState,
  shippingOptionsAction,
} from "@/app/(tienda)/checkout/actions";

/**
 * Checkout en 3 pasos (design/reference/Tienda-Checkout): Datos → Envío → Pago.
 * Un único <form>: los pasos ocultos conservan sus campos y se mandan juntos al confirmar.
 * Los precios que se muestran los calcula el servidor; al confirmar se recalcula todo.
 */

export type CheckoutProps = {
  cp: string;
  zoneLabel: string;
  isMdp: boolean;
  provinces: { id: number; name: string }[];
  subtotal: string;
  groups: { title: string; lines: string[] }[];
  twoBatches: boolean;
  leftOut: string[];
};

const STEPS = ["Datos", "Envío", "Pago"] as const;

export function CheckoutFlow(p: CheckoutProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [step, setStep] = useState(1);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [choices, setChoices] = useState<ChoiceView[]>([]);
  const [ship, setShip] = useState<string | null>(null);
  const [agencies, setAgencies] = useState<AgencyView[] | null>(null);
  const [agency, setAgency] = useState("");
  const [method, setMethod] = useState<"MP" | "TRANSFER">("TRANSFER");
  const [loading, startLoading] = useTransition();
  const [placed, place, placing] = useActionState<PlaceState, FormData>(placeOrderAction, {});

  const selected = choices.find((c) => c.code === ship) ?? null;
  const allErrors = { ...errors, ...placed.errors };

  function fetchOptions(agencyId?: string) {
    const fd = new FormData(formRef.current!);
    if (agencyId !== undefined) fd.set("agencyId", agencyId);
    startLoading(async () => {
      const r = await shippingOptionsAction(fd);
      if (!r.ok) {
        setErrors(r.errors ?? {});
        setNotice(r.error ?? "Revisá tus datos.");
        if (r.errors) setStep(1);
        return;
      }
      setErrors({});
      setNotice(null);
      setChoices(r.choices);
      setShip((cur) =>
        r.choices.some((c) => c.code === cur) ? cur : (r.choices[0]?.code ?? null),
      );
      setStep((s) => Math.max(s, 2));
    });
  }

  function pickShipping(c: ChoiceView) {
    setShip(c.code);
    if (c.toAgency && agencies === null) {
      const provinceId = Number(new FormData(formRef.current!).get("provinceId"));
      startLoading(async () => setAgencies(await agenciesAction(provinceId)));
    }
  }

  function pickAgency(code: string) {
    setAgency(code);
    if (code) fetchOptions(code); // recotiza contra la sucursal elegida (docs/04)
  }

  const canPay = selected !== null && (!selected.toAgency || agency !== "");
  const busy = loading || placing;

  return (
    <form ref={formRef} action={place} className="flex flex-col gap-6" noValidate>
      <ol className="m-steps" aria-label="Pasos">
        {STEPS.map((label, i) => (
          <li
            key={label}
            className={`m-step${i + 1 <= step ? "on" : ""}`}
            aria-current={i + 1 === step ? "step" : undefined}
          >
            <span>
              {i + 1}. {label}
            </span>
            <span>{i + 1 < step ? "Listo" : i + 1 === step ? "Ahora" : "Falta"}</span>
          </li>
        ))}
      </ol>

      {(notice || placed.error) && (
        <p role="alert" className="m-box m-0 !text-[15px] font-medium">
          {placed.error ?? notice}
        </p>
      )}

      {/* ── 1. Datos ───────────────────────────────── */}
      <section hidden={step !== 1} aria-labelledby="h-datos" className="flex flex-col gap-4">
        <h2 id="h-datos" className="m-h2">
          tus datos
        </h2>
        <p className="m-p">Los usamos solo para entregarte el pedido.</p>
        <Field name="name" label="Nombre y apellido" autoComplete="name" errors={allErrors} />
        <Field
          name="email"
          label="Email"
          type="email"
          autoComplete="email"
          hint="Te escribimos con asuntos neutros, sin nombres de producto."
          errors={allErrors}
        />
        <Field
          name="phone"
          label="Teléfono"
          type="tel"
          autoComplete="tel"
          hint="Para coordinar la entrega."
          errors={allErrors}
        />
        <div className="grid grid-cols-2 gap-3">
          <label className="c-label">
            Código postal
            <input className="t-input" value={p.cp} readOnly aria-describedby="cp-hint" />
            <span id="cp-hint" className="text-xs font-normal text-text-2">
              {p.zoneLabel}. Lo cambiás desde el carrito.
            </span>
          </label>
          <Field
            name="locality"
            label="Localidad"
            autoComplete="address-level2"
            defaultValue={p.isMdp ? "Mar del Plata" : ""}
            errors={allErrors}
          />
        </div>
        {p.isMdp ? (
          <input type="hidden" name="province" value="Buenos Aires" />
        ) : (
          <ProvinceSelect provinces={p.provinces} errors={allErrors} />
        )}
        <div className="grid grid-cols-[2fr_1fr] gap-3">
          <Field name="street" label="Calle" autoComplete="address-line1" errors={allErrors} />
          <Field name="number" label="Número" inputMode="numeric" errors={allErrors} />
        </div>
        <Field name="floor" label="Piso o depto (opcional)" errors={allErrors} />
        <Field
          name="notes"
          label={p.isMdp ? "Indicaciones para el cadete (opcional)" : "Indicaciones (opcional)"}
          placeholder="Timbre, horario, quién recibe"
          errors={allErrors}
        />
      </section>

      {/* ── 2. Envío ───────────────────────────────── */}
      <section hidden={step !== 2} aria-labelledby="h-envio" className="flex flex-col gap-3.5">
        <h2 id="h-envio" className="m-h2">
          envío
        </h2>
        <p className="m-p">Opciones reales para el CP {p.cp}, con precio y plazo.</p>
        <div role="radiogroup" aria-label="Opciones de envío" className="flex flex-col gap-2.5">
          {choices.map((c) => (
            <button
              key={c.code}
              type="button"
              role="radio"
              aria-checked={ship === c.code}
              className={`m-opt${ship === c.code ? "on" : ""}`}
              onClick={() => pickShipping(c)}
            >
              <span className="m-radio" />
              <span className="flex flex-1 flex-col gap-1">
                <span className="flex justify-between gap-3 font-semibold">
                  <span>{c.label}</span>
                  <span className="whitespace-nowrap">{c.charged}</span>
                </span>
                <span className="text-sm text-text-2">{c.detail}</span>
              </span>
            </button>
          ))}
        </div>
        {selected?.toAgency && (
          <label className="c-label">
            Sucursal donde retirás
            <select
              className="t-input"
              value={agency}
              onChange={(e) => pickAgency(e.target.value)}
              disabled={agencies === null}
            >
              <option value="">
                {agencies === null
                  ? "Buscando sucursales…"
                  : agencies.length
                    ? "Elegí una sucursal"
                    : "No encontramos sucursales cerca de tu CP"}
              </option>
              {agencies?.map((a) => (
                <option key={a.code} value={a.code}>
                  {a.name} · {a.address}
                </option>
              ))}
            </select>
          </label>
        )}
        {p.twoBatches && (
          <div className="m-box flex flex-col gap-1">
            <span className="text-[15px] font-semibold">Tu pedido sale en dos tandas</span>
            <span className="m-p !text-sm">
              Una llega hoy y la otra en 5 a 10 días. Podés cambiarlo a «todo junto» desde el
              carrito.
            </span>
          </div>
        )}
        <div className="m-box flex items-start gap-3 text-sm">
          <span aria-hidden="true">✓</span>
          Caja 100% neutra, sin logos ni descripción del contenido.
        </div>
      </section>

      {/* ── 3. Pago ────────────────────────────────── */}
      <section hidden={step !== 3} aria-labelledby="h-pago" className="flex flex-col gap-3.5">
        <h2 id="h-pago" className="m-h2">
          pago
        </h2>
        <div role="radiogroup" aria-label="Medio de pago" className="flex flex-col gap-2.5">
          {(
            [
              {
                id: "TRANSFER",
                name: "Transferencia",
                price: selected?.totalTransfer,
                note: "Tenés 24 h para pagar. Te mostramos los datos al confirmar.",
                off: true,
              },
              {
                id: "MP",
                name: "Mercado Pago",
                price: selected?.totalMp,
                note: "Tarjeta de crédito o débito, dinero en cuenta o efectivo (Rapipago / Pago Fácil).",
                off: false,
              },
            ] as const
          ).map((o) => (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={method === o.id}
              className={`m-opt${method === o.id ? "on" : ""}`}
              onClick={() => setMethod(o.id)}
            >
              <span className="m-radio" />
              <span className="flex flex-1 flex-col gap-1.5">
                <span className="flex items-center justify-between gap-3 font-semibold">
                  <span>{o.name}</span>
                  <span className="whitespace-nowrap">{o.price}</span>
                </span>
                <span className="text-sm text-text-2">{o.note}</span>
                {o.off && <span className="pr-off self-start">10% OFF</span>}
              </span>
            </button>
          ))}
        </div>
        <div className="m-box flex flex-col gap-2.5">
          <span className="text-[15px] font-semibold">Tu privacidad en el pago</span>
          <span className="text-sm leading-relaxed text-text-2">
            En tu resumen de tarjeta figura TESERA. Si pagás por transferencia, en el banco figura
            el titular de la cuenta, no el nombre de la tienda.
          </span>
          <span className="text-sm text-text-2">Nadie sabe qué compraste.</span>
        </div>
      </section>

      {/* ── Resumen ────────────────────────────────── */}
      <section aria-labelledby="h-res" className="m-box flex flex-col gap-2.5">
        <h2 id="h-res" className="m-h3">
          Resumen
        </h2>
        {p.groups.map((g) => (
          <div key={g.title} className="flex flex-col gap-0.5 text-sm">
            <span className="font-semibold">{g.title}</span>
            {g.lines.map((l) => (
              <span key={l} className="text-text-2">
                {l}
              </span>
            ))}
          </div>
        ))}
        {p.leftOut.length > 0 && (
          <p className="m-0 text-xs text-text-2">
            No entran en este pedido (no llegan a tu zona): {p.leftOut.join(", ")}.
          </p>
        )}
        <hr className="m-div" />
        <div className="m-row">
          <span className="m-row-k">Subtotal (lista)</span>
          <span>{p.subtotal}</span>
        </div>
        <div className="m-row">
          <span className="m-row-k">Envío</span>
          <span>{selected ? selected.charged : "En el paso de envío"}</span>
        </div>
        <div className="m-row">
          <span className="m-row-k">Transferencia 10% OFF</span>
          <span>
            {step < 3 || !selected
              ? "En el paso de pago"
              : method === "TRANSFER"
                ? `− ${selected.discount}`
                : "No aplica"}
          </span>
        </div>
        <hr className="m-div" />
        <div className="m-row items-center">
          <span className="font-semibold">Total</span>
          <span className="text-[22px] font-semibold" aria-live="polite">
            {selected ? (method === "TRANSFER" ? selected.totalTransfer : selected.totalMp) : "—"}
          </span>
        </div>
      </section>

      <input type="hidden" name="shippingCode" value={ship ?? ""} />
      <input type="hidden" name="agencyId" value={selected?.toAgency ? agency : ""} />
      <input type="hidden" name="method" value={method} />

      <div className="sticky bottom-0 z-10 -mx-5 flex gap-2.5 border-t border-border bg-bg px-5 py-3">
        {step > 1 && (
          <button
            type="button"
            className="m-pill m-pill-ghost min-h-12"
            onClick={() => setStep(step - 1)}
            disabled={busy}
          >
            Volver
          </button>
        )}
        {step === 1 && (
          <button
            type="button"
            className="m-pill min-h-12 flex-1"
            onClick={() => fetchOptions()}
            disabled={busy}
          >
            {loading ? "Buscando envíos…" : "Continuar al envío"}
          </button>
        )}
        {step === 2 && (
          <button
            type="button"
            className="m-pill min-h-12 flex-1"
            onClick={() => setStep(3)}
            disabled={busy || !canPay}
          >
            Continuar al pago
          </button>
        )}
        {step === 3 && (
          <button type="submit" className="m-pill min-h-12 flex-1" disabled={busy || !canPay}>
            {placing
              ? "Confirmando…"
              : method === "TRANSFER"
                ? "Confirmar y ver datos de transferencia"
                : "Confirmar y pagar con Mercado Pago"}
          </button>
        )}
      </div>
    </form>
  );
}

function Field({
  name,
  label,
  errors,
  hint,
  ...input
}: {
  name: keyof FieldErrors;
  label: string;
  errors: FieldErrors;
  hint?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const err = errors[name];
  return (
    <label className="c-label">
      {label}
      <input
        name={name}
        className="t-input"
        aria-invalid={err ? true : undefined}
        aria-describedby={err ? `${name}-err` : hint ? `${name}-hint` : undefined}
        {...input}
      />
      {err ? (
        <span id={`${name}-err`} role="alert" className="text-[13px] font-normal text-text-2">
          {err}
        </span>
      ) : (
        hint && (
          <span id={`${name}-hint`} className="text-xs font-normal text-text-2">
            {hint}
          </span>
        )
      )}
    </label>
  );
}

function ProvinceSelect({
  provinces,
  errors,
}: {
  provinces: { id: number; name: string }[];
  errors: FieldErrors;
}) {
  const [id, setId] = useState("");
  const name = provinces.find((p) => String(p.id) === id)?.name ?? "";
  const err = errors.province;
  return (
    <label className="c-label">
      Provincia
      <select
        name="provinceId"
        className="t-input"
        value={id}
        onChange={(e) => setId(e.target.value)}
        aria-invalid={err ? true : undefined}
      >
        <option value="">Elegí tu provincia</option>
        {provinces.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <input type="hidden" name="province" value={name} />
      {err && (
        <span role="alert" className="text-[13px] font-normal text-text-2">
          {err}
        </span>
      )}
    </label>
  );
}
