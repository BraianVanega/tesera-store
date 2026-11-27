import Link from "next/link";
import { CATEGORIES } from "@/lib/catalog/categories";

export function Footer() {
  return (
    <footer className="t-dark bg-dark text-text">
      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-7 px-5 pt-10 pb-7 lg:gap-12 lg:px-14 lg:pt-16 lg:pb-8">
        <div className="grid grid-cols-2 gap-6 text-sm lg:grid-cols-[1.4fr_1fr_1fr_1fr] lg:gap-12 lg:text-[15px]">
          <div className="col-span-2 flex flex-col gap-2.5 lg:col-span-1">
            <h2 className="m-h3 !text-[22px] lg:!text-[26px]">tu intimidad, en privado.</h2>
            <p className="m-0 max-w-[32ch] text-text-2">
              Caja 100% neutra. En tu resumen figura TESERA. Nadie sabe qué compraste.
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <span className="mb-1 text-text-2">tienda</span>
            <FooterLink href="/sex-shop">Catálogo</FooterLink>
            {CATEGORIES.slice(0, 4).map((c) => (
              <FooterLink key={c.slug} href={`/sex-shop/${c.slug}`}>
                {c.name}
              </FooterLink>
            ))}
          </div>
          <div className="flex flex-col gap-1">
            <span className="mb-1 text-text-2">ayuda</span>
            <FooterLink href="/carrito">Tu pedido</FooterLink>
            <FooterLink href="/#discrecion">Cómo te cuidamos</FooterLink>
            {/* TODO(fase-8): seguimiento, preguntas frecuentes, contacto, envíos, términos y privacidad. */}
          </div>
          <div className="hidden flex-col gap-1 lg:flex">
            <span className="mb-1 text-text-2">legal</span>
            <span className="text-text-2">Solo mayores de 18 años</span>
          </div>
        </div>
        <div
          aria-hidden="true"
          className="overflow-hidden font-display text-[64px] leading-none tracking-[0.2em] whitespace-nowrap text-[var(--wordmark-ghost)] uppercase lg:text-[168px] lg:tracking-[0.25em]"
        >
          <span className="brand-full">Tésera</span>
          <span className="brand-neutral">Tienda</span>
        </div>
        <p className="m-0 text-xs text-text-2 lg:border-t lg:border-[var(--wordmark-ghost)] lg:pt-5 lg:text-[13px]">
          © 2026 Tésera · Sitio para mayores de 18 años · Argentina
        </p>
      </div>
    </footer>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="t-link inline-flex min-h-9 items-center">
      {children}
    </Link>
  );
}
