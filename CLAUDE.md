# Tésera — guía para Claude Code

Tienda online de "bienestar íntimo" (sex shop) para Argentina, con **envío discreto** como diferencial. Front propio en Next.js (no Tiendanube ni Shopify: el "modo discreto" y el checkout a medida no entran en una plataforma cerrada).

Dueño técnico: Brai (nk.studio, Mar del Plata). Operador del día a día: Eric. **No es socio**: cobra un % de las ganancias solo al comienzo, hasta que el negocio se estabilice; el esquema puede cambiar, por eso el % es configuración (`config.operatorProfitSharePct`), nunca un número fijo en el código ni en la UI. Idioma de trabajo: **español** (código y commits en inglés, textos de UI y docs en español rioplatense).

> Leé este archivo entero antes de tocar nada. El detalle vive en `docs/`. Si algo de acá contradice un doc, gana este archivo y avisá.

## Qué hay en este repo

| Ruta | Contenido |
|---|---|
| `docs/01-arquitectura.md` | Stack, estructura de carpetas, decisiones y por qué |
| `docs/02-frontend.md` | Sistema de diseño, pantallas, zonas, modo discreto, hero 3D |
| `docs/03-modelo-datos.md` | Modelo, disponibilidad, flujo de venta, ganancia |
| `docs/04-integracion-sm.md` | API de SexShopMayorista (dropshipping + sync de stock) |
| `docs/05-mercadopago.md` | Checkout Pro / webhooks / transferencia / riesgos de rubro |
| `docs/06-shopify-viabilidad.md` | Decisión: por qué NO usar el carrito de Shopify |
| `docs/07-discrecion-y-privacidad.md` | Reglas de discreción, datos, legales |
| `docs/08-panel-eric.md` | Panel interno mobile |
| `docs/09-seo-geo-blog.md` | SEO, GEO, blog, schema, llms.txt |
| `docs/10-roadmap.md` | Fases con criterios de aceptación (**empezá por acá**) |
| `docs/11-riesgos-y-pendientes.md` | Lo que falta confirmar y riesgos |
| `docs/12-carga-stock-desde-pdf.md` | Cargar stock desde la Nota de Pedido (PDF) de SM |
| `docs/sm-api/` | Documentación oficial de la API de SM (PDF v1 del 19/11/2026 + texto). **Gana sobre cualquier resumen** |
| `design/reference/` | Pantallas del diseño aprobado (`.dc.html`) + `tienda.css`. Referencia visual, NO se copian tal cual |
| `prisma/schema.prisma` | Esquema completo |
| `src/lib/domain/` | Lógica pura (precios, zonas, disponibilidad) con tests |
| `.claude/commands/` | Slash commands del proyecto |

## Stack (fijo salvo que Brai diga otra cosa)

- Next.js (App Router) + TypeScript estricto, pnpm
- Tailwind CSS v4 con tokens como CSS variables (ver `docs/02-frontend.md`)
- Postgres + Prisma (Neon o Supabase) · Vercel (funciones en `gru1`)
- Mercado Pago: **Checkout Pro** (redirect) primero; Bricks después si hace falta
- Resend (emails), Vercel Blob (comprobantes), Vercel Cron (jobs)
- Zod para validar todo input externo (formularios, webhooks, respuestas de SM)
- Vitest (unit) + Playwright (e2e) · ESLint + Prettier
- Three.js solo en el hero desktop, import dinámico (`next/dynamic`, `ssr: false`)

## Comandos

```bash
pnpm install
pnpm dev                 # http://localhost:3000
pnpm test                # vitest
pnpm test:e2e            # playwright
pnpm lint && pnpm typecheck
pnpm prisma migrate dev
pnpm db:seed             # catálogo de ejemplo
pnpm catalog:import --file products.json [--images] [--dry-run]  # borradores desde /products de SM
pnpm sm:sync             # sincroniza stock/costos de SM (script en scripts/)
```

## Reglas de negocio que NO se negocian

1. **Zonas por código postal.** MdP = CP 7600–7612. CABA/GBA = AMBA (se confirma con la cotización de SM: trae `moova-flex`). Resto = Interior. Ver `src/lib/domain/zone.ts`.
2. **Disponibilidad** la decide `availability()` (`src/lib/domain/availability.ts`). Nunca la UI. Consumibles (geles, aceites, preservativos) **nunca** van por dropship: solo MdP, LOCAL o ENCARGO.
3. **Doble precio.** `Product.price` es precio de lista (incluye +5 % por comisión de MP). Transferencia = `round(lista × 0.9)`, se comunica como "10 % OFF pagando por transferencia", **jamás** como recargo por tarjeta (Ley de tarjetas).
4. **Envío gratis** se calcula sobre el subtotal **a precio de lista**: MdP $15.000 · CABA $30.000 · GBA $40.000. Interior: sin envío gratis por ahora. Valores en `src/lib/config.ts`, no hardcodeados en componentes.
5. **Transferencia:** pedido `PENDING_PAYMENT`, vence en 24 h, reserva stock. Dropship/encargo se disparan recién en `PAID`. Vencido → `CANCELLED` y libera stock. Eric verifica desde el panel.
6. **Carrito mixto en MdP:** dos tandas ("Llega hoy" y "Llega en 5 a 10 días"), o todo junto si el cliente lo prefiere. **"Encargo" es término interno**: nunca aparece en textos al cliente; solo lo que llega en el día se destaca.
7. **Pedido a SM:** `externalOrderId = order.code`. SM es idempotente por ese campo (reenviar devuelve `yaExistia:true`), así que se puede reintentar ante timeout. SM acepta pedidos aun sin stock (solo avisa con `warning`): la prevención de sobreventa es nuestra. Usar el `quoteId` cotizado en el **checkout** (con calle y número), no el del carrito. No enviar el email del comprador a SM.
8. **Los webhooks de MP se verifican** (firma + consulta del pago a la API) y son idempotentes por `payment.id`.

## Discreción (es el producto)

- Asuntos de email, títulos de pestaña y notificaciones **neutros** ("Mi pedido", "Novedades de tu compra"). Nada de "sex shop" en ningún texto que salga del sitio.
- Páginas de pedido/seguimiento/checkout: `noindex`, sin analytics de terceros, sin pixel de Meta/Google con nombres de producto.
- **Modo discreto** (modo noche neutro, fuentes de sistema, fotos desenfocadas, botón "Salir ya"): persiste en cookie propia; no se manda a ningún tercero.
- Logs sin PII: nunca loguear dirección, teléfono, email completo ni contenido del carrito.
- Detalle y checklist: `docs/07-discrecion-y-privacidad.md`.

## Convenciones de código

- Dinero siempre en **enteros de pesos** (`Int`), nunca floats. Redondeo `Math.round` en un único lugar (`pricing.ts`).
- Lógica de negocio en `src/lib/domain/` (pura, sin I/O, 100 % testeada). Los route handlers y server actions solo orquestan.
- Server Components por defecto; `"use client"` solo donde hay estado/efectos.
- Todo lo que llega de afuera (SM, MP, formularios) pasa por un schema Zod antes de tocar el dominio.
- Errores de integraciones: registrar en `IntegrationLog` (sin PII) y reintentar con backoff; nunca tragarse el error.
- Commits chicos, en inglés, convencional (`feat:`, `fix:`, `chore:`). Una fase del roadmap = una o varias PRs, no un commit gigante.
- Textos de UI en español rioplatense, voz cálida y literal en títulos/SEO ("Sex Shop", "succionadores", "lubricantes").
- No inventes endpoints, campos ni tarifas de SM o MP: leé `docs/sm-api/` y la documentación oficial. Si falta un dato, dejá un `// TODO(brai):` y listalo en `docs/11-riesgos-y-pendientes.md`.

## Diseño

El diseño aprobado está en `design/reference/` (HTML de referencia + `tienda.css`). Dirección: **"vivo"** — tarjetas a sangre de 20–22 px, botones píldora, titulares grandes en minúscula (-0.035em), fondos grises cálidos para producto, cinta animada, secciones oscuras, sin cajas con borde. Paleta, tipografías y estados están en `docs/02-frontend.md`. No improvises una estética distinta; si algo no está cubierto, preguntá.

## Cómo trabajar

1. Abrí `docs/10-roadmap.md`, tomá la fase pendiente más baja.
2. Planificá antes de codear (modo plan) cuando la fase toca pagos, SM o discreción.
3. Escribí el test del dominio primero cuando haya reglas de negocio.
4. Al terminar una fase: `pnpm lint && pnpm typecheck && pnpm test`, marcá la fase en el roadmap y resumí qué quedó y qué falta.
5. Si te bloquea un dato que solo tiene Brai (credenciales, docs de SM, textos legales), parás y lo pedís; no lo inventes.

## Secretos

Nunca commitear `.env*`. Ver `.env.example`. Tokens de MP y SM solo en variables de entorno del servidor, jamás en código cliente (`NEXT_PUBLIC_*` solo para la public key de MP).


## Pendientes que bloquean fases (no inventar: preguntar a Brai)
- **Consumibles por dropship** (geles, aceites, etc.): ¿pedido mínimo o solo Mar del Plata? Bloquea la Fase 1 (`availability()`). Hasta que Brai decida, `availability()` los deja solo en Mar del Plata, con el caso cubierto por un test fácil de cambiar.
- **Tope diario de pedidos de SM** y valores de `fulfillmentStatus`: bloquean el cierre de la Fase 3.
- **Carga de stock desde factura de SM**: segunda parte; en v1 es carga manual.
