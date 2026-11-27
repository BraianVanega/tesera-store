# 11 · Riesgos y pendientes

## Confirmado por SM (24/11/2026)

- **Cargo de acondicionamiento: $2.300 por pedido** de dropshipping (corregido por la vendedora el 25/11; antes se había entendido "por unidad"). El envío se cobra aparte.
- **Podemos usar las imágenes del proveedor que vienen por la API** (confirmado 25/11). Se descargan una vez y se sirven desde nuestro storage (ver `04`). Las descripciones/textos de SM: sin confirmar, escribir los propios.
- **Nuestra cuenta tiene habilitado el despacho sin etiqueta** (confirmado 25/11): la cotización por API funciona.
- **Todos los envíos son neutros** (paquete y remitente), incluidos los de Mercado Envíos (confirmado 25/11).
- **Abono mensual: $50.000 ARS** (costo fijo del negocio; entra en la liquidación, ver `03`).
- **La lista de precios para stock por mayor es la misma `costoCliente` de la API** (no hay otra lista).
- Envío al interior por **Mercado Envíos**.

## Preguntas abiertas para SM (ya no bloquean: se resuelven en producción)

- [ ] **Tope diario** de requests: SM tampoco lo sabe (25/11). Se asume conservador y el cliente lee los headers `X-RateLimit-Daily-*` para autorregularse (ver `04`). Reconfirmar cuando haya una key activa.
- [ ] Lista completa de valores de `fulfillmentStatus`: SM no la sabe. Se descubren en producción (el poll loguea cada valor nuevo) y mientras tanto `DELIVERED` lo marca Eric a mano.
- [ ] **Retención** y protección de los datos del comprador en SM (solo se confirmó que los envíos son neutros).
- [ ] Política de cambios y fallas; compra mínima para pedidos de stock; si dan remito/tarjeta con nuestra marca.
- [x] ~~Envío al interior~~: sale por **Mercado Envíos** (confirmado por la vendedora el 24/11). La API de cotización lista `CORREO` y `MOOVA`: al integrar, mostrar el `carrierNombre` y el plazo que devuelva la cotización y verificar con un pedido de prueba qué transportista aparece realmente.
- [ ] Mínimo de compra y condiciones para el **pedido semanal de stock** (modo `STOCK`).

## Pendientes de Brai

- [ ] Datos de la cuenta bancaria para transferencias (alias/CBU/titular) → env.
- [ ] Credenciales de producción de MP y API key de SM (solo en Vercel, nunca en el repo).
- [ ] Proyecto de Vercel (región `gru1`), base Postgres de desarrollo (Neon o Supabase) y remoto de GitHub: cierran la Fase 0.
- [ ] Auth del panel (proveedor y variables de entorno): se define en la Fase 7.
- [ ] **Regla de precio de lista** (Fase 2): `Product.price` = costo + margen + 5 % MP (docs/04), pero falta el margen. Hoy los borradores importados toman `precioSugeridoPublico` como referencia.
- [ ] **Datos para los ≥ 50 productos reales** (Fase 2): un JSON de `/products` de SM (o la API key) o el CSV de Buttman/SM con su formato. Al curar: categoría, precio, si es consumible y publicar.
- [ ] Plazo de **Interior** en el badge: hoy "Envío 3 a 6 días"; docs/04 pide tomarlo de la cotización.
- [ ] Valor de `config.sm.staleHours` (oferta vieja = sin stock): hoy **6 h**. ¿Va?
- [ ] **`SM_API_KEY` en `.env.local`** para probar contra la API real (sync, stock y cotizaciones; nunca se crean pedidos de prueba).
- [ ] Forma real de `GET /stock`: la doc no la muestra; se asumió `sku`/`stock`/`estado`.
- [ ] Secrets del repo de GitHub `CRON_BASE_URL` y `CRON_SECRET` (el mismo de Vercel) para los crons frecuentes de SM. Alternativa: Vercel Pro y todo en `vercel.json`.
- [x] ~~**Precio del cadete en MdP**~~: $ 2.500 por tanda (26/11), `config.mdpCourierFee`.
- [ ] **Número de WhatsApp** para el comprobante de transferencia (Fase 5, `WHATSAPP_NUMBER`). Sin él no se muestra el botón.
- [ ] **Datos de la cuenta para transferir** (`TRANSFER_HOLDER`, `TRANSFER_CBU`, `TRANSFER_ALIAS`, solo en Vercel). Sin ellos la página del pedido dice "te pasamos los datos por WhatsApp".
- [ ] **Credenciales de prueba de MP** y **`MP_WEBHOOK_SECRET`** (Fase 5). El MCP ayuda a integrar, pero la tienda llama a la API de MP con `MP_ACCESS_TOKEN`. Configurar la URL del webhook (`/api/webhooks/mercadopago`, evento **"Order (Mercado Pago)"**) en "Configuración de Webhooks" de la app.
- [ ] **Probar la firma del webhook con el simulador de MP** (evento Order) contra un preview de Vercel. La plantilla ya está confirmada con la doc oficial de Checkout Pro (Orders).
- [ ] **Pago con tarjeta después de vencida la reserva de MP**: con la API de Orders, MP no corta el link a las 2 h (la order dura `P4D` para cubrir el ticket de efectivo). Hoy ese pago cae en `late` y Eric lo resuelve. Si pasa seguido: cancelar la order de MP al vencer la reserva (guardar el id de la order).
- [ ] **`config.mpHoldHours`** (cuánto se reserva el stock mientras el cliente paga con MP): hoy **2 h**. ¿Va?
- [ ] Nombre de fantasía definitivo para `statement_descriptor` (hoy `"TESERA"`; MP acepta hasta 13 caracteres).
- [ ] Página del pedido sin token: con PPR el 404 es "blando" (HTTP 200 + noindex + "no encontramos ese pedido"). No expone datos; si se quiere un 404 real, hay que sacar la página del prerender parcial.
- [ ] Textos legales con un profesional (términos, privacidad, cambios, arrepentimiento).
- [ ] Retención de datos (`PII_RETENTION_MONTHS`).
- [ ] Confirmar: ¿email transaccional al cliente? (el panel de Eric es el único aviso interno; el cliente necesita al menos la confirmación y el link de seguimiento).
- [ ] Qué ve Eric de costos y de la liquidación.
- [ ] Proveedor del plan B de pagos (cripto u otro) cuando se decida.
- [x] ~~**GBA sin cotización**~~: resuelto en la Fase 3; la zona sale de la cotización (`moova-flex`). Solo sin SM se vuelve a la detección por CP.
- [x] ~~**Envío gratis por tanda en MdP**~~: cada tanda paga su cadete salvo que llegue a $ 15.000 (26/11).
- [ ] **"Salir ya"** lleva a `https://www.smn.gob.ar/` (`src/lib/shop/constants.ts`). Confirmar el sitio neutro. Borra carrito y zona; deja el modo discreto prendido.
- [ ] **Lighthouse mobile ≥ 90** en home y ficha (aceptación de la Fase 4): no se pudo correr en esta sesión.
- [ ] Diseño del blog (próximo paso de diseño) y decisión de bloquear o no bots de IA de entrenamiento.

## Riesgos

| Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|
| Mercado Pago revisa/limita la cuenta por rubro. La cuenta está aprobada, pero sus políticas hablan de contenido erótico o para adultos | Media | Alto | Mantener lenguaje e imágenes no explícitos; tener la transferencia siempre disponible; plan B de procesador (interfaz `PaymentProvider`); guardar evidencia de la aprobación |
| Sobreventa: SM acepta pedidos sin stock (solo avisa) | Media | Medio | Sync frecuente, revalidar al despachar, `needsAttention` en el panel, mensaje al cliente si hay demora |
| Tope diario de requests de SM agotado por el sync | Media | Medio | Frecuencias conservadoras, leer headers, prioridad a cotización y pedidos |
| `quoteId` vencido (24 h) al despachar una transferencia lenta | Media | Bajo | SM recalcula y avisa; guardar warning; si el costo sube, lo absorbe la tienda (se registra) |
| Cotización con solo CP más cara que la real | Alta | Bajo | Segunda cotización en checkout con calle y número y usar ese `quoteId` |
| Fuga de información sensible (logs, analytics, emails) | Baja | Alto | Checklist de `07`, tests de ausencia de pixels, logs sin PII |
| Meta/Google restringen publicidad y contenido | Alta | Medio | SEO/GEO como canal principal; voz de bienestar; no depender de ads |
| Comprobantes o datos personales expuestos | Baja | Alto | Blob privado + URLs firmadas, retención, supresión |
| Dependencia de un único mayorista | Media | Medio | `Supplier` ya contempla Buttman; estructura de ofertas múltiples |
| Hero 3D baja performance en equipos medios | Media | Bajo | Guardas de capacidad; nunca en mobile |

## Checklist de lanzamiento

- [ ] Compra real por MP, transferencia y efectivo, y en MdP, AMBA e Interior.
- [ ] Webhook de MP en producción con firma verificada; reembolso de prueba.
- [ ] Pedido real a SM con `quoteId` y seguimiento hasta `DELIVERED`.
- [ ] Emails neutros revisados en Gmail/Outlook (asunto, remitente, vista previa).
- [ ] Todas las páginas sensibles con `noindex` y sin trackers de terceros.
- [ ] Textos legales publicados y botón de arrepentimiento probado.
- [ ] Sitemap, robots, `llms.txt`, Search Console configurados.
- [ ] Backups de la base y plan de recuperación.
- [ ] Alertas activas (sync SM, webhook MP, transferencias por vencer).
- [ ] Eric capacitado en el panel con un día de simulación.
