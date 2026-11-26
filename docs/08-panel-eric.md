# 08 · Panel interno de Eric

Mobile first (390 px), ruta `/panel`, `noindex`. Referencia: `design/reference/Panel.dc.html`. Notificaciones v1 (decisión de Brai): **solo el panel**, sin avisos externos a Eric; el panel debe ser la bandeja de entrada (contadores y badges visibles).

## Acceso

- Auth con allowlist de emails (Auth.js, magic link o credenciales); roles `OWNER` (Brai) y `OPERATOR` (Eric). Sesión larga en el dispositivo de Eric.
- Rutas bajo `/panel` protegidas por middleware; Server Actions verifican el rol siempre.
- `OPERATOR` no ve costos de proveedor ni ganancia total; ve lo necesario para operar. `OWNER` ve todo. (Confirmar con Brai qué ve Eric de la liquidación: su % sí.)

## Vistas

| Vista | Qué hace |
|---|---|
| **Hoy** | Pedidos LOCAL para entregar hoy en MdP (dirección, teléfono, ítems), botón "Entregado". Contadores: transferencias a verificar, pedidos con `needsAttention`, stock bajo. |
| **Stock local** | Lista con cantidad; botones +/−; **"Cargar compra" a mano** (en v1: productos, cantidades, costo neto unitario y envío a prorratear → confirmar → "Recibir" al llegar la mercadería). La carga desde factura/remito de SM es segunda parte (ver `12-carga-stock-desde-pdf.md`), y "Ajustar conteo" (ADJUST con nota). |
| **Pedido semanal** | Borrador del `RestockOrder`: encargos pendientes + productos con stock < 2; total estimado para el pedido a SM; Eric revisa, Brai lo realiza; al llegar, "Recibido" carga stock y marca encargos RECIBIDO. |
| **Pedidos** | Filtros por estado, canal, zona, método de pago. Detalle con timeline y acciones permitidas según estado. |
| **Transferencias a verificar** | Comprobante, monto exacto esperado, vencimiento; botón "Marcar pagado" (`markPaid`, guarda `verifiedBy`) o "Rechazar". |
| **Liquidación** | Ganancia del mes y el % de Eric (configurable, hoy 40 %), el resto para Brai; detalle por venta (ver fórmulas en `03`). |

## Alertas visibles (sin salir del panel)

- Transferencia por vencer (< 3 h).
- Pedido a SM con warning (stock o recálculo de envío) → `needsAttention`.
- Saldo de cuenta corriente en SM: recordatorio manual semanal (la API no lo expone).
- Sync de SM fallando (último `syncedAt` viejo).

## Reglas

- Toda acción que cambia estado o stock pasa por funciones de dominio (`markPaid`, `recordStockMovement`, `transition`) y deja rastro (`AuditLog`: quién, qué, cuándo).
- Acciones destructivas piden confirmación.
- Sin datos personales innecesarios en listados; el detalle de dirección solo en el pedido a entregar.
