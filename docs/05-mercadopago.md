# 05 · Pagos: Mercado Pago, transferencia, efectivo y plan B

Alcance v1 (definido por Brai): **Mercado Pago** (tarjeta, cuotas, saldo) + **transferencia con 10 % OFF** + **efectivo** (Rapipago / Pago Fácil, vía MP) + **cripto u otro procesador como plan B** (interfaz lista, implementación después). Checkout: **Checkout Pro (redirect)**. La cuenta de MP de la tienda **ya está aprobada para el rubro** (confirmado por Brai).

## Abstracción de pagos

Todo pasa por una interfaz para poder sumar procesadores sin tocar pedidos:

```ts
// src/lib/payments/provider.ts
export interface PaymentProvider {
  id: "MP" | "TRANSFER" | "CASH_MP" | "ALT";      // ALT = cripto / otro (plan B)
  createCheckout(order: OrderForPayment): Promise<{ redirectUrl?: string; instructions?: unknown }>;
  handleWebhook?(req: Request): Promise<PaymentEvent>;  // normaliza a { orderId, status, externalId }
}
```

`Order.paymentMethod`: `MP | TRANSFER` hoy; agregar `CASH_MP` y `ALT` cuando se activen (migración trivial). La lógica de "qué pasa al pagarse" (`markPaid(orderId)`) es **una sola función**, usada por webhook de MP, verificación manual de Eric y cualquier proveedor futuro.

## Mercado Pago · Checkout Pro (API de Orders)

La app de MP se creó con la **API de Orders** (27/11/2026): el panel avisa que la de Preferences "será descontinuada pronto" y las funciones nuevas salen solo en Orders. Doc oficial: `developers/es/docs/checkout-pro-orders`.

1. **Crear la order** (server): `POST /v1/orders` con `X-Idempotency-Key` (UUID por intento), `type: "online"`, `processing_mode: "manual"`, `total_amount` (string con 2 decimales), ítem **neutro**, `external_reference = order.id`, `config.online` (`success_url`/`pending_url`/`failure_url` a `/pedido/[code]` y `auto_return`), `config.statement_descriptor`, `config.default_payment_due_date` (ticket) y `expiration_time`.
2. Redirigir al `checkout_url` de la respuesta.
3. **Webhook** `POST /api/webhooks/mercadopago` (tópico **Order (Mercado Pago)**, configurado en "Configuración de Webhooks" de la app; la API de Orders **no** recibe `notification_url`):
   - Verificar **firma** (`x-signature` + `x-request-id` + `data.id` del query con la firma secreta) y rechazar si no valida.
   - Tomar el `data.id` (id de la order, `ORD…`), **consultar `GET /v1/orders/{id}`** (nunca confiar en el body), leer `status`, `status_detail` y `external_reference`.
   - **Idempotente** por `(provider, id de la order, status/status_detail)` en `PaymentEvent`.
   - `processed/accredited` → `markPaid(order)`. `created`/`processing`/`action_required` → dejar `PENDING_PAYMENT`. `failed`/`canceled` → se mantiene pendiente hasta vencer (el cliente puede reintentar).
   - Responder 200 rápido (MP espera 22 s y reintenta: 15 min, 30 min, 6 h, 48 h, 96 h…).
4. **Efectivo (Rapipago/Pago Fácil)** queda `action_required` con un pago de tipo `ticket` y se acredita más tarde por el mismo webhook: la reserva de stock dura lo que el ticket. Mostrar el aviso en la confirmación.
5. **Reembolsos**: desde el panel de MP por ahora; webhook `refunded` → `Order` a `CANCELLED` + `StockMovement RETURN` (si aplica).

### Nombres neutros

- En la order, `title` de ítems = categoría neutra ("Artículo de bienestar", "Pedido Tésera") o nombre del producto **solo si Brai lo aprueba**; por defecto neutro. El detalle real vive en nuestra base.
- El `config.statement_descriptor` (resumen de tarjeta) = nombre de fantasía, **hasta 13 caracteres** (doc de MP).
- Lo que el cliente ve de MP (nombre del vendedor) depende de la configuración de la cuenta: revisar nombre de negocio en la cuenta y confirmar el resultado con una compra de prueba.

### Precios y cuotas

- Se cobra el **precio de lista** (ya incluye +5 % de comisión). Cuotas: configuración de la cuenta; el costo financiero lo define MP. No prometer "cuotas sin interés" en la UI sin confirmarlo.
- Moneda ARS. Montos enteros.

### Credenciales y env

`MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET` (solo servidor), `NEXT_PUBLIC_MP_PUBLIC_KEY` (solo si se usa Bricks). Modo sandbox con credenciales de prueba y usuarios de prueba; **prod y test separados por entorno de Vercel**.

### Tests

- Unit: `verifySignature`, mapeo de estados de la order → acción, idempotencia (mismo evento dos veces → un `markPaid`).
- E2E: flujo completo en sandbox; webhook simulado con firma válida/ inválida.

### Cómo quedó implementado (Fase 5)

- **REST con `fetch` + Zod, sin SDK** (`src/lib/payments/mercadopago.ts`), mismo patrón que el cliente de SM. `MP_API_BASE_URL` solo existe para apuntar a un MP falso en el e2e.
- **Order**: un único ítem `"Pedido Tésera"` por el total (envío incluido), `external_reference = order.id`, URLs de retorno → `/pedido/[code]?t=token`. **Sin datos del comprador** (`payer` es opcional: ni email ni nombre).
  - `config.default_payment_due_date` (ticket de efectivo) = `P{config.cashTicketDays}D` = 3 días, lo mínimo que recomienda MP.
  - `expiration_time` = ticket + 1 día (`P4D`). Al vencer, MP cierra la order y **cancela los pagos pendientes**, así que tiene que cubrir el ticket.
  - La reserva corta (`config.mpHoldHours` = 2 h) la maneja **nuestro cron**, no MP. Con Preferences MP cortaba el link a las 2 h; con Orders no hay "disponible hasta". Si alguien paga con tarjeta después de vencida la reserva, `markPaid` devuelve `late` y el pedido queda marcado para Eric (devolver o reactivar).
  - En local (`http://`) no se manda `auto_return`: MP lo rechaza sin HTTPS.
  - `X-Idempotency-Key` nueva por intento; los reintentos por 5xx/timeout reusan la misma, así que nunca se duplica la order.
- **Webhook** (`/api/webhooks/mercadopago`):
  1. Valida la firma; si no valida, responde 401. Plantilla según la doc oficial ("Validar el origen de la notificación"): `id:{data.id};request-id:{x-request-id};ts:{ts};`, HMAC-SHA256 en hex, `data.id` **en minúsculas** (`ORD01…` → `ord01…`).
  2. Solo procesa `type=order`; consulta `GET /v1/orders/{id}`.
  3. `mpOrderAction` decide la acción (`src/lib/payments/mp-status.ts`). Una order procesada cuyo **monto pagado (`total_paid_amount`) o moneda** no coincide con el pedido **no se paga**: queda `needsAttention` para Eric. `processed/partially_refunded` también va a Eric.
  4. Si algo falla, responde 500 y MP reintenta.
  - Es idempotente por `(provider, id de la order, status/status_detail)` en `PaymentEvent`.
- **Ticket de efectivo** (order pendiente con `transactions.payments[].payment_method.type = "ticket"`): la reserva se extiende hasta `created_date` + `cashTicketDays` + `config.cashHoldExtraHours`.
- **Reembolso / contracargo** → `cancelOrder`: se devuelve el stock local con un movimiento `RETURN`. Si ya había encargo o despacho a SM, queda marcado para Eric.
- **Reintentar**: desde `/pedido/[code]` con un pago rechazado o abandonado se crea una order nueva de MP para el mismo pedido.
- **Probar la firma**: con el simulador de "Configuración de Webhooks" (evento Order) contra un preview de Vercel, antes de producción.

## Transferencia

Ver flujo completo en `03-modelo-datos.md`. Resumen técnico:

- Datos de la cuenta (alias/CBU/titular) en `config`/env, **no** en el código del cliente (`TRANSFER_ALIAS`, `TRANSFER_CBU`, `TRANSFER_HOLDER`).
- El monto exacto = `transferPrice(subtotal) + envío`. Mostrar y permitir copiar.
- Comprobante → Vercel Blob **privado** (`uploadPrivateProof`, foto o PDF ≤ 10 MB) o por WhatsApp (`wa.me/<WHATSAPP_NUMBER>` con solo el código del pedido, nunca productos). Hasta el panel (Fase 7) Eric confirma con `pnpm order:mark-paid TS-XXXXXX --by eric`, que usa el mismo `markPaid` que el webhook.
- Opcional (más adelante): conciliación automática leyendo movimientos de MP si la transferencia llega a una cuenta de MP (CVU); no entra en v1.

## Plan B: cripto u otro procesador

- No se implementa en v1; solo queda la interfaz `PaymentProvider` y el campo `ALT`.
- Evaluar cuando haga falta: otro procesador con política clara para el rubro adulto, o cobro cripto. **El criterio de elección es la política del procesador con el rubro y la conciliación**, no la plataforma de tienda (ver `06-shopify-viabilidad.md`).
- Antes de implementar: Brai define proveedor; Claude Code lee su doc oficial y arma el adapter + webhook con la misma idempotencia y `markPaid`.

## Legales de pago (se implementan en Fase 8)

- Botón de arrepentimiento visible y funcional (ver `07`).
- Términos: precios finales en pesos, impuestos incluidos, plazos de entrega por zona, política de cambios y devoluciones.
- Facturación electrónica (ARCA): **fuera de alcance de v1**; dejar el hook `onPaid` para engancharla después.
