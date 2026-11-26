# 09 · SEO, GEO y blog

Objetivo: que Tésera aparezca cuando alguien busca "sex shop" (literal) y que los buscadores con IA (ChatGPT, Perplexity, Gemini, AI Overviews) puedan **citar** sus respuestas. La voz de marca (cálida, educativa) vive en el contenido; los títulos y URLs usan el lenguaje literal.

> El **diseño** del blog (listado, artículo, categorías) todavía no está hecho: es el próximo paso de diseño de Brai. Esta fase implementa la estructura técnica y contenido base; la UI sigue el estilo "vivo" y se ajusta cuando exista el diseño.

## Arquitectura de URLs

```
/sex-shop                          categoría madre (landing de intención comercial)
/sex-shop/succionadores            categorías literales
/sex-shop/lubricantes
/sex-shop/[categoria]/[slug]       o /producto/[slug] (decidir una sola forma y redirigir la otra)
/blog                              listado
/blog/[slug]                       artículo
/blog/categoria/[cat]
/envios-discretos                  página de confianza (zonas, plazos, packaging neutro)
/preguntas-frecuentes
```

Reglas: una sola URL canónica por contenido, `trailing slash` consistente, `canonical` explícito, redirecciones 301 en cambios de slug, slugs en español sin tildes.

## SEO técnico

- `metadata` por página (title ≤ 60 car., description ≤ 155), Open Graph y Twitter cards **sin imágenes explícitas**.
- `sitemap.xml` generado (productos, categorías, blog, páginas de confianza) y `robots.txt` que **bloquea**: `/checkout`, `/carrito`, `/pedido`, `/panel`, `/api`. Esas rutas además llevan `noindex`.
- Core Web Vitals: ver `02-frontend.md` (Three.js solo desktop y diferido).
- Datos estructurados (JSON-LD, generados desde datos reales, nunca inventados):
  - `Organization` + `WebSite` (home).
  - `Product` + `Offer` (precio de lista en ARS, `availability` según stock; no marcar `InStock` si no hay oferta).
  - `BreadcrumbList` en categorías, fichas y artículos.
  - `Article`/`BlogPosting` con `author`, `datePublished`, `dateModified`.
  - `FAQPage` en preguntas frecuentes y artículos con FAQ (útil para que los motores de IA extraigan respuestas; los rich results de FAQ en Google están muy limitados, así que no es el objetivo).
- Imágenes: `alt` descriptivo y no explícito; nombres de archivo literales y neutros.
- Hreflang no hace falta (solo es-AR); `lang="es-AR"`.

## GEO (que las IA puedan citar)

1. **Respuesta primero.** Cada artículo abre con una respuesta directa de 40–60 palabras a la pregunta del título, después desarrolla.
2. **Estructura extraíble:** H2/H3 en forma de pregunta, listas cortas, tablas comparativas (materiales, tipos, cuidados), definiciones claras.
3. **Datos citables:** cifras con fuente y fecha, "última actualización" visible, autoría real (nombre y rol; ver abajo).
4. **E-E-A-T:** página "Quiénes somos" y de contacto reales, política de envíos y devoluciones públicas, revisión por una persona idónea en temas de salud sexual (asesor/a) con mención visible. Sin afirmaciones médicas.
5. **`/llms.txt`** con el resumen del sitio y los enlaces a las páginas clave (categorías, guías, envíos, preguntas frecuentes) en Markdown. `/llms-full.txt` opcional.
6. **Rastreadores de IA:** permitir en `robots.txt` los bots de búsqueda/citación (decisión de Brai si quiere bloquear los de entrenamiento). Las rutas sensibles siguen bloqueadas.
7. **Consistencia de entidad:** mismo nombre ("Tésera"), descripción y datos de contacto en todo el sitio y en `Organization`.

## Contenido del blog (base)

Clústeres iniciales (el CLI crea el esqueleto MDX y 1 artículo ejemplo; la redacción final la revisa Brai/Eric):

| Clúster | Ejemplos de artículos |
|---|---|
| Guías de compra | "Cómo elegir un succionador: guía para principiantes", "Tipos de vibradores y para qué sirve cada uno" |
| Lubricantes | "Lubricante base agua vs silicona: cuál elegir", "Compatibilidad con preservativos y juguetes" |
| Cuidado y seguridad | "Cómo limpiar y guardar tus juguetes", "Materiales seguros: silicona, ABS y qué evitar" |
| Para parejas / para vos | "Primer juguete en pareja", "Autoconocimiento: por dónde empezar" |
| Envíos y discreción | "Cómo es un envío discreto", "Qué figura en tu resumen de tarjeta" |

Cada artículo: respuesta inicial, índice, cuerpo, FAQ (3–5 preguntas), productos relacionados (links internos), fecha de actualización.

## Implementación

- Contenido en **MDX** dentro del repo (`content/blog/*.mdx`) con frontmatter validado por Zod: `title, description, slug, category, author, publishedAt, updatedAt, faq[], related[] (slugs de producto)`.
- Componentes MDX: `<Respuesta>`, `<Tabla>`, `<FAQ>`, `<ProductoRelacionado>` (consulta disponibilidad por zona si el CP está cargado).
- `generateMetadata`, JSON-LD y sitemap salen del frontmatter. Un test verifica que ningún artículo carezca de `description`, `updatedAt` ni FAQ válido.
- Linkeo interno: cada artículo enlaza a su categoría y a ≥ 2 productos; cada categoría enlaza a sus 3 mejores guías.

## Restricciones del rubro

- **Mercado Pago** y otros procesadores: no usar lenguaje ni imágenes explícitas en el sitio.
- **Meta (Instagram/Facebook)**: sus normas de publicidad prohíben anunciar productos de excitación sexual para adultos, salvo que se enfoquen en salud y bienestar sin sexualizar; por eso la voz "bienestar íntimo" también sirve ahí. Redes sociales **no** están en el alcance técnico de esta fase.
- Google: los anuncios para contenido sexual tienen restricciones propias (verificar políticas vigentes antes de pautar).

## Medición

- Search Console (propiedad de dominio) y Bing Webmaster desde el día 1.
- Analytics sin cookies y sin PII; eventos solo en páginas públicas.
- Revisión mensual: consultas literales que traen tráfico, páginas con impresiones y sin clics, citaciones en buscadores con IA (búsqueda manual de las consultas clave).
