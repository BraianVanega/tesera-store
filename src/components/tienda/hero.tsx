"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useDiscrete } from "./discrete";

// Three.js fuera del bundle inicial: solo se descarga en desktop capaz (docs/02).
const HeroMask3D = dynamic(() => import("./hero-mask-3d"), { ssr: false });

/** Guardas antes de descargar three: desktop (≥ 1024 px) y hardware suficiente. */
function canRun3D(): boolean {
  if (!window.matchMedia("(min-width: 1024px)").matches) return false;
  const nav = navigator as Navigator & { deviceMemory?: number };
  if (nav.hardwareConcurrency && nav.hardwareConcurrency < 4) return false;
  if (nav.deviceMemory && nav.deviceMemory < 4) return false;
  return true;
}

function useCan3D() {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const update = () => setOk(canRun3D());
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return ok;
}

export function Hero() {
  const discrete = useDiscrete();
  const can3D = useCan3D();
  const [failed, setFailed] = useState(false);
  const onFail = useCallback(() => setFailed(true), []);
  const show3D = can3D && !discrete && !failed;

  return (
    <section className="t-dark hero-bg relative min-h-[640px] overflow-hidden text-text lg:min-h-[720px]">
      <Ribbons />
      <div className="h3-cv hidden lg:block" aria-hidden="true">
        {show3D && <HeroMask3D onFail={onFail} />}
      </div>
      <div className="relative mx-auto flex min-h-[640px] w-full max-w-[1280px] flex-col justify-end gap-[18px] px-5 pt-8 pb-9 lg:min-h-[720px] lg:gap-6 lg:px-14 lg:pt-14 lg:pb-[72px]">
        <span className="m-pill hero-chip pointer-events-none min-h-[34px] self-start px-3.5 text-[13px] font-semibold lg:min-h-9 lg:px-4 lg:text-sm">
          sex shop online · envíos discretos
        </span>
        <h1 className="m-hero lg:!text-[132px] lg:!leading-[0.92]">
          tu intimidad,
          <br />
          en privado.
        </h1>
        <p className="m-0 max-w-[30ch] text-base leading-[1.45] lg:max-w-[40ch] lg:text-[19px]">
          Bienestar íntimo para vos o en compañía. Elegí con calma y recibilo sin que nadie lo note.
        </p>
        <div className="flex flex-wrap gap-2.5 lg:gap-3">
          <Link href="/sex-shop" className="m-pill lg:min-h-[52px] lg:px-[30px]">
            ver catálogo
          </Link>
          <Link href="#discrecion" className="m-pill m-pill-ghost lg:min-h-[52px] lg:px-[30px]">
            cómo te cuidamos
          </Link>
        </div>
      </div>
    </section>
  );
}

/** Cintas de color y, en mobile, el isotipo estático (el 3D es solo desktop). */
function Ribbons() {
  return (
    <>
      <svg
        viewBox="0 0 390 640"
        aria-hidden="true"
        preserveAspectRatio="xMidYMid slice"
        className="hide-discreto absolute inset-0 h-full w-full lg:hidden"
      >
        <defs>
          <linearGradient id="rb1" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#E3A98A" />
            <stop offset="1" stopColor="#8C2F3C" />
          </linearGradient>
          <linearGradient id="rb2" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor="#5C1A2C" />
            <stop offset="1" stopColor="#E3A98A" />
          </linearGradient>
        </defs>
        <path
          d="M-30 400 C 90 250, 190 560, 430 330"
          fill="none"
          stroke="url(#rb1)"
          strokeWidth="34"
          strokeLinecap="round"
          opacity="0.95"
        />
        <path
          d="M-30 470 C 110 340, 250 620, 430 440"
          fill="none"
          stroke="url(#rb2)"
          strokeWidth="18"
          strokeLinecap="round"
          opacity="0.9"
        />
        <path
          d="M-30 330 C 120 200, 220 470, 430 250"
          fill="none"
          stroke="#F3EBE0"
          strokeWidth="2"
          strokeLinecap="round"
          opacity="0.5"
        />
        <g transform="translate(206 70) scale(1.6)" opacity="0.9">
          <g transform="translate(4 -16)">
            <g transform="translate(-2 -4)">
              <path
                d="M2 50L50 22L54 42L46 58L50 78Z M16 50L29 43L40 50L29 57Z"
                fill="#E3A98A"
                fillRule="evenodd"
              />
            </g>
            <g transform="translate(2 4)">
              <path
                d="M50 22L98 50L50 78L46 58L54 42Z M60 50L71 43L84 50L71 57Z"
                fill="#8C2F3C"
                fillRule="evenodd"
              />
            </g>
          </g>
        </g>
      </svg>
      <svg
        viewBox="0 0 1280 720"
        aria-hidden="true"
        preserveAspectRatio="xMidYMid slice"
        className="hide-discreto absolute inset-0 hidden h-full w-full lg:block"
      >
        <defs>
          <linearGradient id="d1" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#E3A98A" />
            <stop offset="1" stopColor="#8C2F3C" />
          </linearGradient>
          <linearGradient id="d2" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor="#5C1A2C" />
            <stop offset="1" stopColor="#E3A98A" />
          </linearGradient>
        </defs>
        <path
          d="M560 700 C 700 380, 900 760, 1320 300"
          fill="none"
          stroke="url(#d1)"
          strokeWidth="64"
          strokeLinecap="round"
          opacity="0.95"
        />
        <path
          d="M600 760 C 780 520, 980 800, 1320 520"
          fill="none"
          stroke="url(#d2)"
          strokeWidth="30"
          strokeLinecap="round"
          opacity="0.9"
        />
        <path
          d="M520 560 C 720 300, 940 560, 1320 180"
          fill="none"
          stroke="#F3EBE0"
          strokeWidth="2"
          strokeLinecap="round"
          opacity="0.45"
        />
      </svg>
    </>
  );
}
