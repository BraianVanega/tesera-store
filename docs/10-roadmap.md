# 10 · Roadmap por fases

**Modo de trabajo acordado con Brai: una fase a la vez, con revisión.** Al terminar cada fase: correr `pnpm lint && pnpm typecheck && pnpm test`, tildar la fase acá, resumir qué quedó, y **parar a esperar el OK de Brai** antes de pasar a la siguiente (🛑).

Fuera de alcance de v1: facturación electrónica ARCA, verificación formal de edad, notificaciones externas (WhatsApp/push/email a Eric), redes sociales, canal Mercado Libre/Tiendanube, cripto (solo queda la interfaz).

---

## Fase 0 · Base del proyecto
- [x] `create-next-app` (App Router, TS estricto, Tailwind v4, pnpm), ESLint/Prettier, Vitest, Playwright.
- [x] Estructura de carpetas de `01-arquitectura.md`; `src/lib/config.ts`; `.env.example` → validación de env con Zod (`src/lib/env.ts`).
- [x] Copiar `prisma/schema.prisma` y `src/lib/domain/` del kit; CI (GitHub Actions: lint, typecheck, test, build).
- [ ] Deploy de preview en Vercel (región `gru1`) y base Postgres de desarrollo. ⏳ Falta que Brai cree/vincule el proyecto de Vercel y la base (`vercel.json` ya fija `gru1`).
- **Aceptación:** `pnpm dev` levanta; CI verde; los tests de dominio del kit pasan. 🛑
- _Notas 25/11:_ el schema del kit no validaba (enums en una línea; `url`/`directUrl` no van más en el schema con Prisma 7 → `prisma.config.ts`). Corregido sin cambiar modelos. CI escrito; falta verlo verde en GitHub (el repo todavía no tiene remoto).

## Fase 1 · Dominio puro
- [x] Revisar y completar `zone.ts`, `pricing.ts`, `availability.ts` (ya incluidos con tests).
- [x] `orders/transitions.ts` (máquina de estados) con tests.
- [x] `inventory`: recalcular stock desde movimientos, reserva y liberación.
- **Aceptación:** 100 % de cobertura en `domain/`; casos borde (consumibles, AMBA sin stock, carrito mixto) cubiertos. 🛑
- _Notas 25/11:_ 100 % de cobertura (CI lo exige). Nuevo `domain/cart.ts` (tandas Hoy / 5 a 10 días, "todo junto", líneas partidas) y `domain/inventory.ts`; prorrateo por valor en `pricing.ts`. AMBA pasa a "Llega en 48 h" (Brai).

## Fase 2 · Datos y catálogo
- [x] Migración Prisma + `db:seed` (≈ 12 productos de ejemplo con siluetas CSS).
- [x] `scripts/import-sm-catalog.ts` (usa Fase 3 cuando esté; antes, CSV de Buttman/SM que pasará Brai).
- [x] Subida de fotos a storage propio (una sola descarga por URL).
- **Aceptación:** catálogo navegable desde la base con ≥ 50 productos reales cargados. 🛑
- _Notas 25/11:_ migración inicial generada offline; migración, seed (2 veces) e importador (2 veces) probados contra un Postgres en memoria (PGlite): idempotentes. El importador lee el JSON de `/products` de SM (no hay CSV todavía) y crea **borradores** (sin publicar, sin categoría). Consultas de catálogo en `src/lib/catalog/queries.ts`; las pantallas son Fase 4. ⏳ **Faltan los ≥ 50 productos reales**: necesitan base, datos de SM (JSON o CSV) y la regla de precio de Brai.

## Fase 3 · Integración SM
- [ ] Confirmar con SM los ⏳ de `04` (cuenta con "despacho sin etiqueta", tope diario). **Sin esto, no seguir.**
- [ ] `lib/sm/*`: client con rate limit, schemas Zod, sync (full diario / incremental / stock), quote (con cache), dispatch, poll de estado.
- [ ] Crons en Vercel y `pnpm sm:sync`. `IntegrationLog`.
- [ ] Tests con fixtures de `tests/fixtures/sm/`.
- **Aceptación:** sync llena `SupplierOffer`; cotización por CP devuelve opciones y detecta AMBA; pedido de prueba creado en SM dos veces → una sola orden. 🛑

## Fase 4 · Tienda (frontend)
- [ ] Tokens, layout, header con chip de zona, modo discreto (cookie), footer.
- [ ] Home (mobile + desktop con hero), Catálogo, Ficha, Carrito (barra de envío, tandas Hoy/Encargo).
- [ ] Hero 3D desktop con guardas de capacidad.
- [ ] SEO on-page básico y `noindex` en rutas sensibles.
- **Aceptación:** pantallas fieles a `design/reference/`; Lighthouse mobile ≥ 90 en Performance/Accesibilidad en home y ficha; modo discreto completo; sin 3D en mobile ni en equipos débiles. 🛑

## Fase 5 · Checkout y pagos
- [ ] Checkout 3 pasos; segunda cotización con calle y número; guardado de `quoteId`.
- [ ] `PaymentProvider` + Mercado Pago Checkout Pro, preferencia, webhook verificado e idempotente, efectivo vía MP.
- [ ] Transferencia: reserva, timer 24 h, comprobante a Blob, `expire-transfers`.
- [ ] Confirmación (MP / Transferencia) y seguimiento.
- **Aceptación:** pago de prueba en sandbox → `PAID`; webhook duplicado no duplica; transferencia vence y libera stock; pedido dropship de prueba despachado a SM. 🛑

## Fase 6 · Fulfillment y stock
- [ ] `markPaid` → LOCAL/ENCARGO/DROPSHIP según `availability`.
- [ ] Movimientos de stock, encargos, restock semanal (borrador automático).
- [ ] Poll de estado de SM → `SHIPPED` con `trackingCode` (`DELIVERED` lo marca Eric hasta conocer los valores de `fulfillmentStatus`).
- [ ] **Carga de stock manual** con vista previa editable (producto, cantidad, costo neto unitario, costo de envío a prorratear) y recepción en dos pasos (ENVIADO → RECIBIDO). Sin PDF en v1.
- **Aceptación:** los tres caminos de venta funcionan de punta a punta con datos de prueba. 🛑

## Fase 7 · Panel de Eric
- [ ] Auth con allowlist y roles; vistas de `08-panel-eric.md`; `AuditLog`.
- [ ] Liquidación del operador con % configurable (hoy 40 %; acuerdo transitorio).
- **Aceptación:** Eric completa un día de operación de ejemplo solo con el panel en su teléfono. 🛑

## Segunda parte (después del lanzamiento v1)
- [ ] **Carga de stock desde documento de SM** (`docs/12-carga-stock-desde-pdf.md`). Decisión 25/11: la fuente de verdad es la **factura/remito de lo que llega**, no la Nota de Pedido (que es solo lo pedido y puede diferir). La NP queda opcional para detectar faltantes.
- [ ] Pendiente para arrancar: **una factura o remito real de SM** (no la tenemos todavía) para fijar el parser. La vista previa permite editar cantidades, borrar líneas y agregar productos que no estén en el documento.
- [ ] Alertas de pago de cuenta corriente a SM.

## Fase 8 · Legales, emails y discreción
- [ ] Términos, privacidad, cambios y devoluciones, envíos, botón de arrepentimiento (textos los valida Brai con un abogado).
- [ ] Emails transaccionales neutros al cliente (confirmación y seguimiento) con Resend — *supuesto: sí se envía email al cliente aunque no haya avisos a Eric; Brai confirma*.
- [ ] Anonimización/supresión de datos; revisión con el checklist de `07`.
- **Aceptación:** checklist de discreción en verde para todas las pantallas y mails. 🛑

## Fase 9 · Blog SEO/GEO
- [ ] Estructura MDX, componentes, JSON-LD, sitemap, robots, `llms.txt`.
- [ ] Esqueleto de clústeres y 1 artículo modelo; test de frontmatter.
- [ ] Aplicar el diseño del blog cuando exista.
- **Aceptación:** validación de datos estructurados sin errores; sitemap correcto; artículo modelo con respuesta inicial + FAQ. 🛑

## Fase 10 · Endurecimiento y lanzamiento
- [ ] Seguridad: headers (CSP, HSTS), rate limit en login/seguimiento/webhooks, revisión de secretos, dependabot.
- [ ] E2E completos (Playwright) en CI; pruebas de carga ligeras en cotización/checkout.
- [ ] Monitoreo y alertas (sync SM, webhooks MP).
- [ ] Checklist de lanzamiento (`11`), dominio, credenciales de producción de MP y SM, compra de prueba real.
- **Aceptación:** una compra real de punta a punta por cada medio de pago (MP, transferencia, efectivo) y por cada zona (MdP, AMBA, Interior). 🛑
