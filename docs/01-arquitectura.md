# 01 · Arquitectura

## Principios

1. **Un solo sistema propio**: catálogo, carrito, checkout, pedidos y panel viven en el mismo Next.js. SM y MP son integraciones, no fuentes de verdad de pedidos.
2. **Dominio puro**: precios, zonas y disponibilidad son funciones sin I/O (`src/lib/domain`). Se testean solas y las usan la tienda, el checkout y el panel.
3. **Discreción por diseño**: cualquier cosa que salga del sitio (email, pixel, log, descriptor) pasa por una revisión de discreción.
4. **Jobs idempotentes**: sync de SM, vencimiento de transferencias y pedido semanal pueden correr dos veces sin romper nada.

## Diagrama lógico

```
Cliente ──► Next.js (RSC + Server Actions)
              │
              ├── domain/  (pricing, zone, availability)
              ├── Prisma ──► Postgres
              ├── SM client ──► API SexShopMayorista (stock, cotización, órdenes)
              ├── MP client ──► Checkout Pro  ◄── webhook /api/webhooks/mercadopago
              ├── Resend (emails neutros) · Blob (comprobantes)
              └── Cron: sync-sm · expire-transfers · weekly-restock-draft

Eric ───► /panel (mobile, auth por allowlist) ──► mismas Server Actions
```

## Estructura de carpetas

```
src/
  app/
    (tienda)/            # home, catálogo, ficha, carrito, checkout, seguimiento
      page.tsx
      sex-shop/[categoria]/page.tsx     # URLs literales para SEO
      producto/[slug]/page.tsx
      carrito/page.tsx
      checkout/page.tsx
      pedido/[code]/page.tsx            # noindex
    (blog)/blog/...                     # ver docs/09
    panel/               # Eric: hoy, stock, semanal, pedidos, liquidacion
    api/
      webhooks/mercadopago/route.ts
      cron/{sync-sm,expire-transfers,restock-draft}/route.ts
  components/            # ui/ (primitivos), tienda/, panel/
  lib/
    domain/              # PURO: zone, pricing, availability (+ tests)
    sm/                  # client, schemas (zod), sync, quote, dispatch
    mp/                  # order (API de Orders), webhook, verify
    orders/              # crear orden, transiciones de estado, stock
    discrete/            # cookie + helpers de modo discreto
    config.ts            # umbrales, % de descuento, plazos
    db.ts                # prisma singleton
  styles/tokens.css
prisma/schema.prisma
scripts/                 # import de catálogo, sm:sync manual
docs/ design/ .claude/
```

## Decisiones (y por qué)

| Decisión | Motivo |
|---|---|
| Next.js propio, no Tiendanube/Shopify | Modo discreto, zonas por CP, doble precio, tandas "Hoy/Encargo" y el flujo de transferencia con reserva de stock no se pueden hacer dentro de un checkout cerrado. Ver `06-shopify-viabilidad.md`. |
| Postgres + Prisma | Modelo relacional claro (movimientos de stock, encargos, restock). |
| Checkout Pro primero | Menos superficie PCI, sale rápido; el pago ocurre en MP. Bricks queda para una segunda etapa si el redirect baja conversión. |
| Server Actions + route handlers finos | Toda la lógica en `lib/`; los handlers solo validan (Zod) y orquestan. |
| Sin cuentas de cliente al inicio | Menos fricción y menos datos sensibles guardados. Seguimiento por código de pedido + token en el link del email. |
| Cron en Vercel | Alcanza para sync cada 15 min, vencimientos y borrador semanal. |
| Three.js solo desktop | Se carga por import dinámico y se descarta si el equipo no lo banca (`docs/02-frontend.md`). |

## Variables de entorno

Ver `.env.example`. Agrupadas: base de datos, SM, MP, email, auth del panel, cron, app.

## Calidad

- CI: `lint`, `typecheck`, `test`, `build` en cada PR.
- Playwright cubre: cambio de zona por CP, carrito mixto MdP, checkout transferencia, checkout MP (modo sandbox), modo discreto.
- Observabilidad: Vercel logs + tabla `IntegrationLog`; alertas por email a Brai si falla el sync de SM o un webhook de MP 3 veces seguidas.
