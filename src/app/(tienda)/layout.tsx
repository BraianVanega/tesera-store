import { ExitNow } from "@/components/tienda/discrete";
import { Footer } from "@/components/tienda/footer";
import { AnnouncementBar, Header } from "@/components/tienda/header";

export default function TiendaLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-screen flex-col bg-bg text-text">
      <a
        href="#contenido"
        className="m-pill sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50"
      >
        Ir al contenido
      </a>
      <AnnouncementBar />
      <Header />
      <main id="contenido" className="flex-1">
        {children}
      </main>
      <Footer />
      <ExitNow />
    </div>
  );
}
