import type { Metadata } from "next";
import "./globals.css";

// Fase 0: layout mínimo. Tipografías, tokens, header y modo discreto llegan en la Fase 4 (docs/02).
export const metadata: Metadata = {
  title: "Tésera",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es-AR" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
