const ITEMS =
  "• caja neutra   • envío discreto   • 10% off con transferencia   • solo TESERA en tu resumen   ";

/** Cinta animada (decorativa: el mismo contenido está en el resto de la página). */
export function Ticker() {
  return (
    <div
      aria-hidden="true"
      className="overflow-hidden bg-[var(--ticker-bg)] py-4 text-[22px] font-medium tracking-[-0.02em] whitespace-nowrap text-[var(--ticker-fg)] lg:py-5 lg:text-[30px]"
    >
      <div className="m-ticker">
        {[0, 1, 2, 3].map((i) => (
          <span key={i}>{ITEMS}</span>
        ))}
      </div>
    </div>
  );
}
