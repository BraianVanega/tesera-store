# 02 · Frontend

Referencia visual aprobada: `design/reference/*.dc.html` + `design/reference/tienda.css`. Son HTML de canvas (Claude Design); sirven para ver estructura, copy y estilos. **Reimplementar en React/Tailwind**, no copiar markup tal cual.

## Dirección de diseño: "vivo"

- Tarjetas a sangre, radio 20–22 px; botones **píldora**; sin cajas con borde.
- Titulares grandes en minúscula, grotesk, `letter-spacing: -0.035em`.
- Fondos de producto en gris cálido; siluetas CSS mientras no hay fotos reales (`sh-bottle`, `sh-jar`, `sh-kit`, `sh-lace`, `sh-vibe`).
- Cinta animada (ticker), secciones oscuras `#1D1311`, badges chicos redondeados.
- Hero con antifaz (isotipo) — 3D en desktop, SVG estático en mobile.
- Marca "Tésera": wordmark en Marcellus; todo el resto Hanken Grotesk.

## Tokens (`src/styles/tokens.css`)

| Token | Claro (default) | Oscuro / zonas `.t-dark` |
|---|---|---|
| bg | `#F3F0EB` | `#1D1311` |
| surface | `#E6E2DB` | `#251917` |
| text | `#1B1512` | `#EFE6DA` |
| accent | `#5C1A2C` (vino) | `#D9A27E` (oro rosa) |

Paleta de marca: nocturno `#14100E`, borra `#251917`, vino `#5C1A2C`, oro rosa `#D9A27E`, cobre `#8A4B2A`, piedra `#A8998C`, travertino `#EFE6DA`.

**Modo discreto** = tema aparte (no es el `.t-dark` de marca): fondo `#121212` neutro, **fuente de sistema**, fotos desenfocadas, wordmark reemplazado por un título neutro, `document.title = "Mi pedido"`, botón fijo **"Salir ya"** (redirige a un sitio neutro y limpia el estado). Se activa por toggle (ojo en el header) y persiste en cookie propia `tsr_discreto=1`. Ver `07-discrecion-y-privacidad.md`.

## Pantallas (mobile first 390 px, desktop 1280 px)

| Pantalla | Ref | Notas |
|---|---|---|
| Home | `Tienda-Home`, `Desktop` | Hero, ticker, carrusel, categorías, banda de envíos, bloque de privacidad, footer. Variantes: sin CP, MdP, AMBA, Interior, Discreto |
| Catálogo | `Tienda-Catalogo` | Filtros: "Hoy en MdP", categoría, precio |
| Ficha | `Tienda-Ficha` | Badge de disponibilidad por zona, doble precio, add-ons solo MdP |
| Carrito | `Tienda-Carrito` | Barra de envío gratis, tandas "Llega hoy" / "Llega en 5 a 10 días" (nunca "encargo" de cara al cliente), "Prefiero recibir todo junto" |
| Checkout (3 pasos) | `Tienda-Checkout` | Datos → Envío → Pago (MP / Transferencia) |
| Confirmación | `Tienda-Confirmacion` | MP o Transferencia (monto exacto, timer 24 h, copiar alias/CBU, subir comprobante) |
| Seguimiento | `Tienda-Seguimiento` | Estados abajo |
| Panel Eric | `Panel` | Ver `08-panel-eric.md` |

Pantallas aún sin rediseño "vivo" (heredaron estilos nuevos pero conservan el layout anterior): Catálogo, Ficha, Carrito, Checkout, Confirmación, Seguimiento y Panel. Cuando las implementes, aplicá la dirección "vivo" de la Home.

## Zona y disponibilidad en la UI

- Chip de zona en el header: pide CP; guarda la zona en cookie `tsr_zona` (no es PII fuerte: solo CP y zona).
- Badges (texto exacto):
  - `Hoy en Mar del Plata` (LOCAL)
  - `Llega en 5 a 10 días` (ENCARGO; se muestra como texto de plazo normal, **sin badge destacado**: es lo habitual en un e-commerce. Solo "Hoy en Mar del Plata" lleva badge resaltado)
  - `Llega en 48 h` (AMBA: CABA y GBA, DROPSHIP con el envío de SM; confirmado por Brai 25/11)
  - `Envío 3 a 6 días` (Interior, DROPSHIP)
  - `No disponible en tu zona`
- Sin CP cargado: mostrar precio y badge genérico "Elegí tu zona para ver el envío".
- Consumibles fuera de MdP → "No disponible en tu zona".
- Todo se calcula con `availability()`; la UI solo renderiza.

## Precio

- Mostrar precio de lista grande y debajo `$X con transferencia · 10% OFF`.
- Nunca "recargo", "interés" ni "+5 % tarjeta".
- Barra de envío gratis calculada sobre lista (`config.freeShipping[zone]`).

## Estados de pedido (Seguimiento)

`Pendiente de pago → Pagado → En preparación → Enviado → Entregado` · `Cancelado`.
Productos que no están en stock local (internamente "encargos"): `Confirmado → En camino a Mar del Plata → Listo para entregar`. El término "encargo" es solo interno (panel, base de datos); al cliente se le habla de plazo de llegada.
Mapeo a `OrderStatus` / `EncargoStatus` en `03-modelo-datos.md`.

## Hero 3D (solo desktop)

- Antifaz = isotipo de dos mitades: `ExtrudeGeometry` (depth ≈ 9, bisel), `MeshPhysicalMaterial` (izquierda oro rosa metálico, derecha vino con clearcoat), entorno PMREM de estudio, luz key + rim.
- Animación: intro 2,6 s (llegan separadas y se juntan) y ciclo de 10 s (separadas 0–35 %, se juntan 35–50 %, juntas 50–72 %, se separan 72–87 %), inclinación con el mouse, flotación suave. `prefers-reduced-motion` → pose estática unida.
- Implementación sugerida: `three` por npm (la referencia usa 0.149 UMD; podés usar la versión actual con módulos), componente `HeroMask3D` cargado con `next/dynamic({ ssr:false })`.
- **Se quita (queda solo título + cintas) si:** no hay WebGL; `navigator.hardwareConcurrency < 4` o `deviceMemory < 4`; renderer por software (`/swiftshader|llvmpipe|software|basic render/i`); o ≥ 20 frames > 50 ms en los primeros 6 s. **Nunca en mobile** (< 1024 px).
- El código de referencia está en `design/reference/Desktop.dc.html` (función `start(el)`).

## Rendimiento y accesibilidad

- LCP < 2,5 s en mobile 4G; imágenes con `next/image`; Three.js fuera del bundle inicial.
- Contraste AA en ambos temas; foco visible; todo clickeable ≥ 44 px; textos alternativos neutros en modo discreto.
- Animaciones respetan `prefers-reduced-motion`.

## SEO on-page (resumen; detalle en `09-seo-geo-blog.md`)

URLs literales: `/sex-shop`, `/sex-shop/succionadores`, `/sex-shop/lubricantes`, etc. `<title>` y H1 con el término literal; la voz cálida va en los textos. Páginas de checkout, pedido y panel: `noindex`.
