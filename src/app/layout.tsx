import type { Metadata, Viewport } from "next";
import { Hanken_Grotesk, Marcellus } from "next/font/google";
import { env } from "@/lib/env";
import { discreteBootScript } from "@/lib/discrete/guard";
import { COOKIES, DISCRETE } from "@/lib/shop/constants";
import "./globals.css";

// next/font sirve las fuentes desde nuestro dominio: el navegador no le pide nada a Google (docs/07).
const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-hanken",
  display: "swap",
});
const marcellus = Marcellus({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-marcellus",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(env().SITE_URL),
  title: { default: "Sex Shop online con envío discreto · Tésera", template: "%s · Tésera" },
  description:
    "Sex shop online en Argentina: succionadores, vibradores, lubricantes y más. Caja 100% neutra, envío discreto y 10% OFF pagando por transferencia.",
  applicationName: "Tésera",
  formatDetection: { telephone: false, address: false, email: false },
};

export const viewport: Viewport = {
  themeColor: "#1d1311",
};

/**
 * Modo discreto sin parpadeo: un script inline lee la cookie propia y aplica el tema y el título
 * neutro antes del primer pintado. Así el layout no lee cookies y la tienda sigue prerenderizada
 * (docs/02 y node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md).
 */
const discreteScript = discreteBootScript(DISCRETE.neutralTitle, COOKIES.discrete);

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es-AR"
      data-theme="claro"
      className={`${hanken.variable} ${marcellus.variable} h-full`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: discreteScript }} />
      </head>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
