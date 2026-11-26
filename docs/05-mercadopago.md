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

## Mercado Pago · Checkout Pro

1. **Crear preferencia** (server) con: ítems (nombre **neutro**, ver abajo), `external_reference = order.id`, `notification_url`, `back_urls` (success/pending/failure a `/pedido/[code]`), `auto_return`, `statement_descriptor` con el nombre de fantasía de la tienda, `expires`/vencimiento razonable.
2. Redirigir a `init_point`.
3. **Webhook** `POST /api/webhooks/mercadopago`:
   - Verificar **firma** (`x-signature` + `x-request-id` con el secreto del webhook) y rechazar si no valida.
   - Tomar el `payment.id`, **consultar el pago a la API de MP** (nunca confiar en el body del webhook), leer `status` y `external_reference`.
   - **Idempotente** por `payment.id`: tabla `PaymentEvent(unique externalId)`.
   - `approved` → `markPaid(order)`. `pending`/`in_process` → dejar `PENDING_PAYMENT`. `rejected`/`cancelled` → se mantiene pendiente hasta vencer (el cliente puede reintentar).
   - Responder 200 rápido; trabajo pesado en background si hace falta.
4. **Efectivo (Rapipago/Pago Fácil)** llega como pago `pending` con ticket y se aprueba más tarde por el mismo webhook: la reserva de stock del pedido debe durar lo que dure el ticket (config `CASH_HOLD_HOURS`, ver plazos en la doc de MP al implementar). Mostrar el aviso en la confirmación.
5. **Reembolsos**: desde el panel de MP por ahora; webhook de `refunded` → `Order` a `CANCELLED` + `StockMovement RETURN` (si aplica).

### Nombres neutros

- En la preferencia, `title` de ítems = categoría neutra ("Artículo de bienestar", "Pedido Tésera") o nombre del producto **solo si Brai lo aprueba**; por defecto neutro. El detalle real vive en nuestra base.
- El `statement_descriptor` (resumen de tarjeta) = nombre de fantasía. Verificar en la doc de MP los límites de longitud/caracteres.
- Lo que el cliente ve de MP (nombre del vendedor) depende de la configuración de la cuenta: revisar nombre de negocio en la cuenta y confirmar el resultado con una compra de prueba.

### Precios y cuotas

- Se cobra el **precio de lista** (ya incluye +5 % de comisión). Cuotas: configuración de la cuenta; el costo financiero lo define MP. No prometer "cuotas sin interés" en la UI sin confirmarlo.
- Moneda ARS. Montos enteros.

### Credenciales y env

`MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET` (solo servidor), `NEXT_PUBLIC_MP_PUBLIC_KEY` (solo si se usa Bricks). Modo sandbox con credenciales de prueba y usuarios de prueba; **prod y test separados por entorno de Vercel**.

### Tests

- Unit: `verifySignature`, mapeo de estados MP → acción, idempotencia (mismo `payment.id` dos veces → un `markPaid`).
- E2E: flujo completo en sandbox; webhook simulado con firma válida/ inválida.

## Transferencia

Ver flujo completo en `03-modelo-datos.md`. Resumen técnico:

- Datos de la cuenta (alias/CBU/titular) en `config`/env, **no** en el código del cliente (`TRANSFER_ALIAS`, `TRANSFER_CBU`, `TRANSFER_HOLDER`).
- El monto exacto = `transferPrice(subtotal) + envío`. Mostrar y permitir copiar.
- Comprobante → Vercel Blob (URL firmada, privado). Eric verifica en el panel.
- Opcional (más adelante): conciliación automática leyendo movimientos de MP si la transferencia llega a una cuenta de MP (CVU); no entra en v1.

## Plan B: cripto u otro procesador

- No se implementa en v1; solo queda la interfaz `PaymentProvider` y el campo `ALT`.
- Evaluar cuando haga falta: otro procesador con política clara para el rubro adulto, o cobro cripto. **El criterio de elección es la política del procesador con el rubro y la conciliación**, no la plataforma de tienda (ver `06-shopify-viabilidad.md`).
- Antes de implementar: Brai define proveedor; Claude Code lee su doc oficial y arma el adapter + webhook con la misma idempotencia y `markPaid`.

## Legales de pago (se implementan en Fase 8)

- Botón de arrepentimiento visible y funcional (ver `07`).
- Términos: precios finales en pesos, impuestos incluidos, plazos de entrega por zona, política de cambios y devoluciones.
- Facturación electrónica (ARCA): **fuera de alcance de v1**; dejar el hook `onPaid` para engancharla después.
