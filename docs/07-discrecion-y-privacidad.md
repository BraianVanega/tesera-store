# 07 · Discreción, privacidad y legales

La discreción **es** el producto. Cada feature nueva pasa por el checklist del final.

## Qué promete Tésera

1. Lo que sale del sitio no revela el rubro: emails, notificaciones, pestañas, descriptor de tarjeta, paquete.
2. Si el cliente no quiere que aparezca su información, no aparece (modo discreto, sin cuentas obligatorias, sin rastreo de terceros en lo sensible).
3. Guardamos lo mínimo y lo podemos borrar.

## Capas

| Capa | Regla |
|---|---|
| **Paquete** | Caja 100 % neutra, sin marca (SM lo hace en dropship). Pedidos de stock propio: packaging neutro propio, remitente neutro. |
| **Pago** | `statement_descriptor` = nombre de fantasía. Ítems con título neutro en MP. Transferencia: el cliente ve el titular real de la cuenta (limitación bancaria; se le avisa). |
| **Emails** | Asuntos y remitente neutros ("Tu pedido TS-XXXX", "Novedades de tu compra"). Cuerpo con mínimo detalle; el detalle se ve en `/pedido/[code]?t=token`. |
| **Sitio** | Modo discreto: tema neutro oscuro, fuente de sistema, fotos desenfocadas, `document.title = "Mi pedido"`, botón fijo "Salir ya". Cookie propia `tsr_discreto`. |
| **Páginas sensibles** | `/checkout`, `/pedido/*`, `/panel/*`: `noindex, nofollow`; `Cache-Control: private`; sin analytics de terceros. |
| **Tracking** | Sin pixel de Meta/Google/TikTok en checkout, carrito ni pedido. En el resto, analytics propio o sin cookies (p. ej. Plausible) sin PII ni nombres de producto. |
| **Logs** | Sin dirección, teléfono, email completo ni carrito. Usar `orderCode` y IDs. |
| **Datos en SM** | Mandar solo lo necesario para entregar (nombre, dirección, teléfono del envío). Sin email. |
| **Seguimiento** | Acceso por código + token firmado en el link; sin cuenta. Rate limit y token no adivinable. |

## Datos personales (Ley 25.326)

- Informar finalidad en un aviso de privacidad claro (en el footer y en el checkout).
- Guardar: nombre, teléfono, dirección, email (para confirmación). Nada de DNI/CUIT salvo que se implemente facturación (fuera de v1).
- Retención: anonimizar datos personales de pedidos entregados pasados N meses (config `PII_RETENTION_MONTHS`, valor lo define Brai). Función `anonymizeOrder(orderId)` + job.
- Derecho de acceso/supresión: formulario o email de contacto; implementar `eraseCustomer(email)`.
- Base en Argentina o proveedor con cláusulas adecuadas; cifrado en tránsito y en reposo (Neon/Supabase lo dan). Comprobantes de transferencia en Blob **privado** con URL firmada de corta vida.
- Base de datos con acceso restringido; el panel no muestra más datos de los necesarios (Eric ve lo que necesita para entregar).

## Legales del e-commerce (Fase 8)

> No soy abogado: Brai debe validar estos textos con un profesional antes de lanzar.

- **Botón de arrepentimiento**: visible y funcional (cancelar una compra dentro del plazo legal de 10 días corridos desde la entrega, según la normativa de defensa del consumidor; verificar redacción vigente). Debe poder usarse sin cuenta (por código de pedido + email/token). Ver nota de excepciones por higiene: los productos íntimos usados suelen tener restricciones de cambio; definir y comunicar la política en términos.
- **Términos y condiciones**, **política de privacidad**, **cambios y devoluciones**, **envíos y plazos por zona**, **medios de pago**.
- **Precios**: finales, en pesos, impuestos incluidos. Descuento por transferencia comunicado como descuento, nunca como recargo por tarjeta.
- **Defensa del consumidor**: datos de la autoridad y del proveedor (razón social/CUIT) en el sitio, como exige la normativa.
- **Mayores de 18**: contenido y compra para adultos. Aviso visible en la home y en el checkout ("Solo para mayores de 18 años"). Verificación formal de edad: no entra en v1; Brai decide si la agrega.
- **Lenguaje**: descripciones y fotos no explícitas (sin desnudos), alineadas con las políticas de MP y de buscadores/redes.

## Checklist de discreción por feature

- [ ] ¿Algún texto que salga del sitio menciona el rubro?
- [ ] ¿Se envía algún dato del carrito/pedido a un tercero (analytics, pixel, email provider más allá de lo necesario)?
- [ ] ¿Se loguea algo con PII?
- [ ] ¿La página nueva tiene `noindex` y `private` si es sensible?
- [ ] ¿Funciona y se ve bien en modo discreto?
- [ ] ¿El nombre del archivo, ruta o título de pestaña revela el rubro?
