# 12 · Carga de stock desde documentos de SM (SEGUNDA PARTE)

> **Estado (25/11):** diferido a después del lanzamiento v1. En v1 el stock se carga a mano. **Cambio de criterio:** el documento que se sube debe ser la **factura/remito de lo que llega** (fuente de verdad de cantidades y costo real); la Nota de Pedido es solo lo pedido y queda opcional. Todavía no tenemos una factura de ejemplo: no implementar el parser de factura hasta tenerla. Lo que sigue describe la Nota de Pedido, que sirve como base y como fixture de referencia. En la vista previa Eric debe poder editar cantidades, borrar líneas y agregar productos que no estén en el documento.

Decisión de Brai (25/11): el stock propio se carga en el panel a partir del **PDF que devuelve SM** cuando se le compra stock, en vez de tipear producto por producto. Este doc se basa en un PDF real ("Nota de Pedido", NP 100071718, 16 líneas, 56 unidades) y su resultado esperado está en `tests/fixtures/pedido-np-ejemplo.expected.json`.

## Qué es (y qué no es) ese PDF

- Es una **Nota de Pedido** generada por SM al ingresar la compra (estado "cotización aceptada"). **No prueba que la mercadería haya llegado**: las cantidades finales pueden diferir.
- Por eso la carga es en **dos pasos**: (1) subir la NP al hacer el pedido → queda como pedido semanal enviado; (2) al llegar la mercadería, Eric confirma lo recibido → recién ahí entra al stock.
- Trae datos personales del titular de la cuenta (nombre, CUIT, dirección, teléfono). El parser **ignora esa sección**; el PDF se guarda en Blob **privado** y no se usa como fixture del repo.

## Estructura del documento

Encabezado: razón social de SM, **NP** (número de nota de pedido), fecha de ingreso, fecha de entrega, operación. Luego `DATOS CLIENTE`, `DETALLE` (tabla), totales y forma de pago.

Columnas del detalle: `Código · Descripción · Cantidad · P.Unitario · I.I. · Bonif. · P.Total`.

Reglas verificadas con el ejemplo:

| Regla | Detalle |
|---|---|
| `P.Total = Cantidad × P.Unitario × (1 − Bonif/100)` | Se cumple en las 16 líneas (±$0,03 de redondeo) |
| **Costo unitario neto = `P.Total / Cantidad`** | Es el `costoCliente` real pagado (ya con la bonificación). Ejemplo: gel de $4.705 con 50 % → $2.352,50 |
| `P.Unitario` es el **precio de lista** de SM, no nuestro costo | No usarlo como costo |
| `Neto` = suma de `P.Total` (±$0,05) | Ejemplo: $272.557,74. `Total = Neto`: **los precios ya incluyen IVA** (el IVA figura solo informativo) |
| `I.I.` (impuestos internos) | $0,00 en el ejemplo; guardarlo si aparece |
| **No hay costo de envío en el PDF** | Va por separado ("Despacho a Transporte"): se carga a mano para prorratearlo |
| Forma de pago: `CUENTA CORRIENTE 4 DIAS` | Guardar el plazo; genera un recordatorio de pago en el panel |

## Cuidado con el texto del PDF

El PDF (wkhtmltopdf) tiene texto seleccionable, pero la extracción plana trae ruido:

- Los **códigos se cortan en dos renglones** (`ST-` / `GSDL80`) y a veces tienen espacio después del guion (`BI- 014750`, `D02- 2`). **Normalizar**: quitar espacios → `ST-GSDL80`, `BI-014750`, `D02-2`.
- Las **descripciones largas** continúan en el renglón siguiente (`... PARA MASAJES Y` / `LUBRICANT`).
- El encabezado tiene letras separadas por espacios (`D i re c c i ó n`). Irrelevante: solo se lee el detalle.

## Algoritmo de extracción (determinístico, sin IA como primera opción)

1. Extraer ítems de texto **con coordenadas** (`unpdf` o `pdfjs-dist` en Node; no depender del binario `pdftotext` en Vercel).
2. Ubicar la fila de encabezado del detalle y calcular las bandas de columnas por posición X.
3. Agrupar ítems por Y en filas. Una fila **con cantidad y P.Total** abre una línea nueva; las filas sin cantidad se pegan a la línea anterior (descripción y/o final del código).
4. Normalizar código, parsear números en formato argentino (`$12.544,00`, `56,00%`).
5. Leer `NP`, fecha de ingreso, `Neto`, `Total`, forma de pago.
6. **Validar** (cada falla se marca en la vista previa, no se descarta):
   - Fórmula de cada línea (±$0,03).
   - Σ `P.Total` = `Neto` (±$0,05).
   - Cantidad entera > 0.
   - NP no cargada antes (`@@unique([supplier, supplierRef])`).
7. **Cruzar con el catálogo** por código normalizado contra `SupplierOffer.supplierSku`. Sin match → "producto sin vincular" (Eric lo vincula o crea el borrador de producto).
8. **Contra-chequeo de costo**: comparar el costo neto de la línea con el `costoCliente` vigente de la API de SM (±$1). Si difiere, avisar (campaña vencida, bonificación distinta).
9. **Fallback**: si las validaciones fallan por un cambio de formato, ofrecer extracción asistida por IA solo del bloque de detalle (con el mismo set de validaciones) y la edición manual de líneas. Nunca confirmar una carga que no cierre contra el `Neto` sin una confirmación explícita.

## Flujo en el panel (Stock local → "Cargar compra")

1. **Subir NP** → vista previa: tabla de líneas (código, descripción, cantidad, costo neto, estado del cruce), totales y alertas.
2. Campos manuales: **costo de envío del despacho** (opcional ahora, se puede completar al recibir), notas.
3. **Confirmar** → crea `RestockOrder` (`supplierRef = NP`, estado `ENVIADO`), sus `RestockLine`, guarda el PDF (Blob privado) y asigna los **encargos pendientes** que correspondan a esas líneas (marca `PEDIDO_A_PROVEEDOR`).
4. **Al llegar la mercadería**: "Recibir" → Eric ajusta la cantidad recibida por línea (faltantes/sobrantes) → se generan `StockMovement` `IN` con `unitCost = costo neto + parte del envío prorrateada por valor`, el pedido pasa a `RECIBIDO` y los encargos a `RECIBIDO` (listos para entregar).
5. **Pago a SM**: según la forma de pago de la NP, el panel muestra "Pagar a SM antes del …" (fecha de ingreso + plazo). Solo recordatorio; el pago es manual.

## Reglas

- Una NP no se carga dos veces (idempotencia por `supplierRef`).
- Nunca modificar stock directo: siempre por `StockMovement`.
- El parser vive en `src/lib/restock/parse-np.ts`, es puro (recibe ítems de texto, devuelve líneas + errores) y tiene tests con el fixture.
- Si más adelante aparece el **remito/factura** de la entrega con otro formato, se agrega otro parser; la vista previa y las validaciones se reutilizan.
