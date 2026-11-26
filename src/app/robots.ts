import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

// Rutas sensibles fuera de los buscadores (además llevan noindex). docs/07 y docs/09.
// TODO(brai): decidir si se bloquean los bots de IA de entrenamiento (docs/11).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/carrito", "/checkout", "/pedido", "/panel", "/api"],
      },
    ],
    host: env().SITE_URL,
  };
}
