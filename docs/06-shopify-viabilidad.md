# 06 · ¿Se puede (y conviene) integrar el carrito de Shopify?

**Decisión: no.** Es técnicamente posible, pero rompe lo que hace diferente a Tésera. Este doc existe para que nadie lo reabra sin los datos.

## Viabilidad técnica

Sí se puede usar Shopify como backend con un front propio (headless): el front en Next.js lee productos y arma el carrito con la **Storefront API (objeto Cart)** y, al pagar, redirige a `cart.checkoutUrl`, donde Shopify **aloja** el checkout. Funciona en todos los planes. Hay una app oficial de Mercado Pago para Shopify (Checkout Pro y Tarjetas) que se instala desde el panel de Shopify.

## Por qué no conviene

| Problema | Impacto en Tésera |
|---|---|
| **El checkout lo controla Shopify.** La personalización profunda (campos propios, lógica de checkout, Functions a medida, API de configuración) es de **Shopify Plus**. | No se puede hacer el flujo propio: transferencia con 10 % OFF + reserva de 24 h + verificación de Eric, tandas "Hoy/Encargo", validación de zona por CP. |
| **Dominio y marca del checkout** son los de Shopify (o un subdominio con branding limitado). | Se rompe el **modo discreto** (modo noche neutro, título "Mi pedido", "Salir ya") justo en el paso más sensible. |
| **Shopify Payments no está disponible en Argentina** (hasta donde sé; verificar en su página de países). Los pagos van por un procesador externo. | Shopify cobra una **comisión adicional por transacción (2 % en plan Basic)** sobre lo que ya cobra MP. Para transferencia/manual también aplica según el caso. |
| **Costo fijo mensual** del plan. | Costo nuevo para un negocio que ya paga ~5 % de MP y quiere margen. |
| **Datos de clientes en un tercero** (Shopify). | Va contra la promesa de discreción y control de datos. |
| **El flujo de negocio ya es 100 % custom**: stock local, encargos, pedido semanal, dropship por API de SM, panel de Eric, liquidación del operador. | Habría que sincronizar pedidos/stock entre Shopify y nuestra base: dos fuentes de verdad. |
| **Tracking en dos dominios** (el front y el checkout de Shopify). | Complica analytics y atribución, y choca con "sin pixels en checkout". |

## ¿Shopify "para tener otros medios de pago"?

No aporta. En Argentina los medios de pago los dan los **procesadores** (Mercado Pago y otros), y Shopify los consume a través de apps. Todo procesador que sirva en Shopify se puede conectar directo a un Next.js. Shopify sumaría costo, comisión extra y pérdida de control, sin ampliar la oferta de medios. Lo que sí importa es la **política de cada procesador con el rubro adulto** (ver `05-mercadopago.md`, plan B).

## Cuándo reabrir la decisión

Solo si pasara algo de esto:
1. Ningún procesador acepta el rubro y Shopify (con un procesador compatible) sí.
2. El negocio crece al punto de querer Shopify Plus por otras razones (multi-canal, POS).
3. Se decide abandonar el checkout propio. En ese caso, revisar de nuevo con la política de contenido de Shopify para productos adultos y el plan Plus, que **no verificamos** en este análisis.

## Alternativa elegida

Carrito y checkout propios en Next.js + Mercado Pago Checkout Pro + transferencia propia (`05-mercadopago.md`).
