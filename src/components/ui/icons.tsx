// Íconos de línea del diseño (stroke = currentColor). Siempre decorativos: aria-hidden.
type P = { size?: number; className?: string };
const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
});

export function EyeIcon({ size = 22, slashed = false, className }: P & { slashed?: boolean }) {
  return (
    <svg {...base(size)} strokeWidth={1.5} className={className}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
      {slashed && <path d="M3 3l18 18" />}
    </svg>
  );
}

export function BagIcon({ size = 24, className }: P) {
  return (
    <svg {...base(size)} strokeWidth={1.5} className={className}>
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
      <path d="M3 6h18" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </svg>
  );
}

export function PinIcon({ size = 18, className }: P) {
  return (
    <svg {...base(size)} strokeWidth={1.6} className={className}>
      <path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </svg>
  );
}

export function TruckIcon({ size = 24, className }: P) {
  return (
    <svg {...base(size)} strokeWidth={1.5} className={className}>
      <path d="M3 7h11v9H3zM14 10h4l3 3v3h-7" />
      <circle cx="7" cy="18" r="1.6" />
      <circle cx="17" cy="18" r="1.6" />
    </svg>
  );
}

export function CloseIcon({ size = 18, className }: P) {
  return (
    <svg {...base(size)} strokeWidth={2} className={className}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}
