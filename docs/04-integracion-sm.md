# 04 · Integración con SexShopMayorista (SM)

Fuente de verdad: `docs/sm-api/api-dropshipping-v1.pdf` (v1, actualizada 19/11/2026). Este doc la traduce a decisiones de diseño. **No inventes campos**: si algo no está acá ni en el PDF, es un ⏳ para preguntarle a SM (ver `11`).

## Datos de la API

- Base: `https://www.sexshopmayorista.com` · Auth: `Authorization: Bearer sm_…` (la key se muestra una sola vez; solo en env del servidor).
- Respuestas: `{ ok:true, data }` o `{ ok:false, error }`.
- **Límites:** 60 req/min y un tope diario por cliente. Headers `X-RateLimit-Limit/Remaining` y `X-RateLimit-Daily-Limit/Daily-Remaining`; al excederlos, `429` + `Retry-After`. El valor del tope diario no figura en la doc y **SM tampoco lo sabe** (25/11): diseñar para autorregularse con los headers (`Daily-Remaining`), con frecuencias conservadoras al inicio (ver tabla de sync). SM dice que un sync razonable usa "decenas de requests por día".
- Paginación en `/products`, `/products/modificados` y `/stock`: `page`, `pageSize` (default 50, máx 200), respuesta `{ total, page, pageSize, totalPaginas, items }`. Preferir el loop "hasta `items` vacío".

| Endpoint | Uso en Tésera |
|---|---|
| `GET /api/v1/products` (+ `/{sku}`) | Catálogo completo con fotos. **Una vez por día** (también trae campañas) |
| `GET /api/v1/products/modificados?desde=ISO` | Sync incremental de datos/precio/fotos (**no** incluye stock ni inicio/fin de campaña) |
| `GET /api/v1/stock` (+ `/{sku}`) | Stock; se sincroniza aparte y más seguido |
| `GET /api/v1/categories` | Marcas |
| `GET /api/v1/provincias` | Ids de provincia (cachear; cambia poco) |
| `POST /api/v1/shipping/quotes` | Cotizar envío → `quoteId` + opciones con `code` |
| `GET /api/v1/shipping/agencies?provinciaId=&cp=` | Sucursales de Correo (`agencyId`) |
| `POST /api/v1/orders` | Crear pedido (dropship) |
| `GET /api/v1/orders/{externalOrderId}` | Estado y `trackingCode` |

### Producto (campos relevantes)

`sku, nombre, upc, marca, precioSugeridoPublico, costoCliente, campania {nombre, descuentoPct, hasta} | null, iva, stock, estado, permiteFlex, pesoGramos, dimensionesCm, imagenes[{orden,url}], ultimaActualizacion`.

- Solo vienen productos **habilitados para dropshipping**, activos y no eliminados.
- **El stock NO es el real:** `stock = remanente − margen − reservas`, piso 0, **tope 20**. `4..20` disponible · `1..3` bajo_stock · `0` agotado. Nunca mostrar "quedan 20"; mostrar "últimas unidades" cuando `estado = bajo_stock`.
- `costoCliente` = lo que paga Tésera (precio sugerido menos el descuento de nuestro segmento, o el de la campaña vigente si es mayor). **`campania` cambia sin tocar `ultimaActualizacion`** → releer `/products` completo 1 vez por día.
- Fotos: webp 1400×1400, URL con hash de contenido. **Descargar cada URL una sola vez**, subirla a nuestro storage/CDN y saltear las que ya tenemos (misma URL = misma foto). No re-bajar desde la API.
- `iva` viene por artículo (para facturación futura).
- `permiteFlex`, `pesoGramos`, `dimensionesCm`: SM calcula bultos con esto; no hace falta que nosotros lo hagamos.

## Cotización de envío (`POST /shipping/quotes`)

> ✅ **Requisito de cuenta:** la doc dice que el endpoint está "disponible solo si tu cuenta tiene habilitado el despacho sin etiqueta". SM confirmó el 25/11 que nuestra cuenta lo tiene.

Body: `destino { cp (obligatorio, 4–8), localidad?, provinciaId?, calle?, numero?, agencyId? }` + `items [{sku, cantidad}]`. **Mandar siempre `items`**: solo así devuelve `quoteId` y calcula bultos reales.

Respuesta: `quoteId`, `venceEn` (24 h por defecto), `paquete`, `options[]` con `carrier` (MOOVA = YIP/Flex para CABA/GBA · CORREO), `servicio` (FLEX · CP clásico · EP expreso), `tipoEntrega` (D domicilio · S sucursal), `code` (ej. `moova-flex`, `ca-cp-dom`, `ca-cp-suc`, `ca-ep-dom`), precio final con impuestos en ARS, `plazoMinDias/plazoMaxDias` (días hábiles desde el despacho, sin preparación).

### Reglas de uso

1. **Cotizar dos veces.** (a) En el carrito, con solo el CP → mostrar opciones y detectar zona. (b) En el checkout, con calle + número → **este** `quoteId` es el que se usa al crear el pedido (con CP solo da un estimado más caro; el precio exacto baja bastante con la dirección completa). Nunca guardar el `quoteId` del paso (a) para el pedido.
2. **Detección de AMBA:** si la cotización trae una opción `MOOVA / moova-flex` → zona AMBA (ya lo usa `zone.ts`). MdP/Interior: Correo.
3. **Sucursal:** si el cliente elige una opción `-suc`, listar `shipping/agencies`, volver a cotizar con `destino.agencyId` y crear el pedido con ese `quoteId` y el mismo `envio.agencyId`. Cotizar a sucursal sin `agencyId` es solo orientativo.
4. **Vigencia 24 h** = igual que la ventana de transferencia. Si al despachar el `quoteId` venció, SM recalcula y avisa con `warning`; guardar el warning y mostrarlo en el panel. El `quoteId` solo vale para el mismo destino (CP + provincia).
5. **Cache:** cotizar al cambiar CP/carrito con debounce y cachear por `(cp, hash(items))` unos minutos: hay 60 req/min y tope diario.
6. El precio cotizado es "lo que te facturamos"; si damos envío gratis, **absorbemos ese costo** (va a `Order.shippingCost`).

## Crear pedido (`POST /orders`)

```jsonc
{
  "externalOrderId": "TS-7K3QX9",        // nuestro código de pedido (idempotencia)
  "envio": { "nombre", "telefono", "calle", "numero", "piso",
             "localidad", "codigoPostal", "provincia", "provinciaId",
             "shippingCode", "quoteId", "agencyId" /* solo -suc */ },
  "items": [{ "sku", "cantidad" }],
  "totalVentaFinal": 49980.00,           // informativo; a nosotros nos facturan costoCliente
  "moneda": "ARS",
  "notas": "opcional"
}
```

- Obligatorios: `externalOrderId`, `envio`, `items`. **`comprador` (email/teléfono) es opcional → no mandarlo** (discreción: SM no necesita el email; `envio.telefono` lo usa el transportista).
- **Idempotencia nativa:** reenviar el mismo `externalOrderId` no duplica; devuelve `200` con el mismo `pedidoId` y `yaExistia:true`. Por eso: usar el código de pedido de Tésera como `externalOrderId` y **reintentar sin miedo** ante timeout. `409` = se está procesando, reintentar luego.
- `201` → `{ pedidoId, estado:"INGESTADO", totalMayorista, warnings[] }`. Guardar `supplierOrderId`, `totalMayorista` y `warnings`.
- **Stock insuficiente: SM acepta igual** y devuelve un `warning`. La prevención de sobreventa es nuestra: chequear `/stock` antes de vender (el sync) y revalidar justo antes de despachar.
- Costo del pedido: `costoCliente × cantidad` + línea de envío (cotizado) + **cargo de acondicionamiento: $2.300 por PEDIDO de dropshipping** (no por producto; la vendedora lo corrigió el 25/11; el envío se cobra aparte). Ejemplo: 1 producto a $2.000 → $4.300 más envío; 3 productos a $2.000 → $8.300 más envío. A esto se suma el **abono mensual de $50.000** (se cobra siempre). `config.smDropshipFeePerOrder`.
- Errores: `400` JSON/campos · `401` key inválida o cliente deshabilitado · `422` SKU inexistente o no habilitado (ver `data.items`) · `429` límite.

## Estado (`GET /orders/{externalOrderId}`)

`{ estado:"INGESTADO", fechaIngesta, fulfillmentStatus:"despachado", trackingCode }`. Job `poll-sm-orders` (cada 1–2 h, solo pedidos `FULFILLING`/`SHIPPED`): al ver `trackingCode` → guardar y pasar a `SHIPPED`; **la lista completa de valores de `fulfillmentStatus` no está documentada y SM no la sabe (25/11)**. Reglas: guardar siempre el valor crudo en `Order.supplierStatus`; mapear solo lo conocido (`despachado` / presencia de `trackingCode` → `SHIPPED`); **loguear en `IntegrationLog` cada valor nuevo** para descubrir el resto en producción; mientras no haya mapeo de "entregado", `DELIVERED` lo marca Eric desde el panel (o se infiere del tracking de Mercado Envíos si se integra después).

## Diseño del cliente (`src/lib/sm/`)

```
client.ts     fetch tipado: Bearer, timeout 10 s, lee headers de rate limit, respeta Retry-After,
              reintento con backoff (GET siempre; POST /orders también, es idempotente)
schemas.ts    Zod de producto, stock, provincias, cotización, agencias, orden, estado
sync.ts       syncProductsFull() diario · syncProductsIncremental() · syncStock()
quote.ts      cotización (carrito/checkout) + cache + detección AMBA
dispatch.ts   crea la orden en SM al pasar a PAID
```

### Frecuencias del sync (configurables en `config.ts`; respetar topes)

| Job | Frecuencia inicial | Requests aprox. |
|---|---|---|
| `syncProductsFull` (campañas, costos, fotos nuevas) | 1×/día, de madrugada | ~total/200 páginas (≈10) |
| `syncProductsIncremental` (`desde = max(ultimaActualizacion)`) | cada 1–2 h | 1–2 |
| `syncStock` (`/stock` paginado) | cada 30–60 min | ≈10 con catálogo de ~2000 SKU |

Con ~2000 SKU, `/stock` completo son ≈10 páginas por corrida: a 30 min serían ~480/día. **Hasta saber el tope diario, empezar en 60 min** y que `client.ts` frene el sync cuando `Daily-Remaining` < 20 % (dejando margen para cotizaciones y pedidos, que tienen prioridad). Alternativa si el tope es bajo: `/stock/{sku}` solo de los ~50 SKUs que vendemos.

### Reglas

1. Credenciales en env: `SM_API_BASE_URL`, `SM_API_KEY`. Nunca en cliente.
2. Upsert de ofertas por `[supplier, supplierSku, mode]` con `syncedAt = now`. Si el sync falla **no borrar**: alertar; una oferta con `syncedAt` mayor a `SM_STALE_HOURS` se trata como sin stock.
3. Catálogo nuestro (curado ~50 productos, textos de marca) y datos de SM (costo, stock, fotos) están separados: `Product` ↔ `SupplierOffer` por `supplierSku`. Un script `scripts/import-sm-catalog.ts` crea borradores de `Product` para que Brai/Eric elijan cuáles publicar.
4. `Product.price` lo define Tésera (costo + margen + 5 % MP); `precioSugeridoPublico` es solo referencia.
5. **Despacho** (`dispatch.ts`): al `PAID`, revalidar stock → armar el body con el `quoteId` del checkout → `POST /orders` con `externalOrderId = order.code` → guardar `supplierOrderId`, `warnings`, `dispatchedAt`. Si hay warning de stock o de recálculo de envío, marcar `Order.needsAttention = true` para que se vea en el panel.
6. Fallas: 4xx → `IntegrationLog` + `needsAttention`; 5xx/timeouts/429 → reintentar con backoff; tras 3 fallos, alerta por email a Brai.
7. Saldo de cuenta corriente: la API no lo expone; recordatorio manual en el panel de Eric (ver `08`).

## Mapeo a nuestro modelo

- Producto SM → `Product` + `SupplierOffer(supplier=SM, mode=DROPSHIP)`; mismos SKU en `mode=STOCK` para los pedidos semanales a MdP. **Confirmado por SM: la lista de precios del stock por mayor es la misma `costoCliente` de la API**, así que `cost` es igual en ambos modos (cambia el cargo de acondicionamiento y el envío). Abono mensual de SM: **$50.000** (costo fijo, ver `03`).
- `estado=bajo_stock` → badge "Últimas unidades"; `agotado` → sin oferta disponible.
- Campaña vigente → ya viene aplicada en `costoCliente`; guardar `campaign` solo informativo (nombre, `descuentoPct`, `hasta`) para el reporte de margen.
- Interior: SM confirmó que sale por **Mercado Envíos**. El plazo y el transportista mostrados salen de la cotización (no hardcodear "3 a 6 días" si la cotización devuelve otro rango).
- Envío: opciones de la cotización → mostrar `carrierNombre` + plazo (`plazoMinDias`–`plazoMaxDias` + 1 día de preparación) con los textos de badge de `02-frontend.md`.

## Tests

- Fixtures anonimizadas de cada respuesta en `tests/fixtures/sm/` (copiadas de los ejemplos del PDF y de respuestas reales de sandbox/prod).
- Contrato: cada schema Zod valida su fixture.
- `dispatch.ts`: llamar dos veces con el mismo pedido → una orden en SM (mock que devuelve `yaExistia:true` la segunda).
- `quote.ts`: detección de AMBA con/sin `moova-flex`; uso del `quoteId` del checkout, no el del carrito.
- `client.ts`: respeta `Retry-After`; frena al bajar `Daily-Remaining`.

## Preguntas abiertas para SM

Ver `11-riesgos-y-pendientes.md` (cuenta con "despacho sin etiqueta", tope diario, monto y base del cargo fijo, valores de `fulfillmentStatus`, privacidad de datos del comprador, política de cambios).
