# 03 · Modelo de datos y flujos

El esquema ejecutable está en `prisma/schema.prisma`. Este doc explica las reglas. Estado: borrador 24/11/2026; pendiente confirmar con SM el cargo de dropship y el mínimo de compra (ver `11`).

## Zonas

| Zona | Detección | Fuentes |
|---|---|---|
| MDP | CP 7600–7612 | LOCAL (hoy) → ENCARGO (5–10 días) → DROPSHIP directo (opcional, envío pago) |
| AMBA | la cotización de SM trae `moova-flex` | DROPSHIP |
| INTERIOR | resto | DROPSHIP |

CABA vs GBA (para el umbral de envío gratis): CABA = CP numérico 1000–1499; el resto de AMBA = GBA. Implementado en `src/lib/domain/zone.ts`.

## Disponibilidad

`availability(producto, zona)` → `{ available:false } | { available:true, source, delivery }`. Regla completa en `src/lib/domain/availability.ts`:

- MDP: LOCAL si hay stock local; si no, ENCARGO si SM tiene stock; si no, no disponible.
- AMBA/INTERIOR: DROPSHIP si hay oferta con stock y el producto no es consumible; si no, no disponible.

## Precios

- `Product.price`: lista en pesos enteros, ya incluye +5 % para cubrir la comisión de MP.
- Transferencia: `round(lista × (1 − 0.10))`. Parámetro `TRANSFER_DISCOUNT_PCT = 10` en `config.ts`.
- Mercado Libre (canal ML, futuro): siempre MP, precio calculado aparte con su comisión.
- Umbral de envío gratis sobre subtotal **a lista**: MdP 15.000 · CABA 30.000 · GBA 40.000.
- Comunicación: "10 % OFF pagando por transferencia"; nunca recargo por tarjeta.

## Flujo al confirmar una venta (`PAID`)

| Fuente | Qué pasa |
|---|---|
| LOCAL | `StockMovement` SALE (−qty) + aviso en el panel de Eric para entregar |
| ENCARGO | `Encargo` PENDIENTE; entra en el próximo `RestockOrder` al cierre semanal |
| DROPSHIP | `POST /api/v1/orders` a SM con `externalOrderId = order.code`, `shippingCode` + `quoteId` del checkout (idempotente por `externalOrderId`; ver `04`) |

Carrito mixto en MdP: dos tandas (local hoy, encargo cuando llega) o todo junto si el cliente prefiere (entonces entrega cuando llega el encargo).

## Transferencia

1. Cliente elige transferencia → `Order` en `PENDING_PAYMENT`, `paymentDueAt = now + 24 h`, stock LOCAL reservado.
2. Ve monto exacto con descuento, datos de la cuenta, botón copiar, sube comprobante (Blob) o lo manda por WhatsApp.
3. Eric lo ve en "Transferencias a verificar" y marca pagado → `PAID` (`verifiedBy`, `paidAt`).
4. Cron `expire-transfers` (cada hora): vencidos → `CANCELLED` y libera stock.

El titular de la cuenta que ve el cliente en su banco es el titular real, no el nombre de la tienda (limitación del banco; se avisa en la pantalla).

## Estados

`OrderStatus`: PENDING_PAYMENT → PAID → FULFILLING → SHIPPED → DELIVERED · CANCELLED.
`EncargoStatus`: PENDIENTE → PEDIDO_A_PROVEEDOR → RECIBIDO → ENTREGADO · CANCELADO.
Transiciones válidas centralizadas en `src/lib/orders/transitions.ts` (nadie escribe `status` directo).

## Stock local

`LocalStock.quantity` se recalcula desde `StockMovement` (IN, SALE, ADJUST, RETURN). `unitCost` en IN incluye envío prorrateado del pedido semanal.

## Pedido semanal (RestockOrder)

Borrador automático cada semana (cierre = jueves, configurable): encargos pendientes + productos con stock local < 2. Eric revisa y Brai hace el pedido a SM. Al recibir: IN de stock y encargos → RECIBIDO.

## Ganancia por venta

- Dropship: `precio − (Σ costoCliente×cant + 2.300 por pedido + envío cotizado absorbido) − comisión MP/ML` (0 en transferencia, pero se resta el descuento). **El cargo de acondicionamiento de SM es $2.300 por pedido** (corregido por SM el 25/11). Costo del pedido = `dropshipOrderCost(lines)` en `pricing.ts`.
- **Regla de publicación:** el cargo fijo por pedido pesa más en pedidos de un solo producto barato. Definir un **pedido mínimo** o un margen mínimo por pedido (`config.minDropshipMarginPct`, lo define Brai) y no ofrecer dropship para productos baratos (consumibles ya quedan afuera). Cuantos más productos por pedido, mejor se diluye el cargo: sugiere subir el carrito mínimo en AMBA/Interior.
- Local/encargo: `precio − (costo mayorista + envío semanal prorrateado) − cadete − comisión`.
- Costos fijos mensuales: **abono de SM $50.000** (`config.fixedMonthlyCosts`). ⏳ Brai define si se descuenta **antes** de calcular el % del operador (supuesto del kit) o lo absorbe él.
- Liquidación mensual: `ganancia de ventas − costos fijos` = ganancia neta; **% del operador (Eric) = `config.operatorProfitSharePct`, hoy 40 %**, y el resto es de Brai. Es un acuerdo transitorio (hasta que el negocio se estabilice): el % debe poder cambiar sin tocar código y la liquidación guarda el % vigente de cada mes. Los costos reales vienen de `unitCost` y `shippingCost`. El panel muestra también el **punto de equilibrio** del mes (cuánto margen falta para cubrir el abono).

## Convenciones

- Dinero en `Int` de pesos. Fechas en UTC, mostrar en America/Argentina/Buenos_Aires.
- Códigos de pedido legibles y no secuenciales (ej. `TS-7K3QX9`) para no exponer volumen.
- Datos del cliente (nombre, teléfono, dirección) en `Customer`/`Address`, con borrado/anonimización posible (ver `07`).
