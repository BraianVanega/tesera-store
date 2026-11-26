# Tésera · kit de arranque para Claude Code

Este paquete es el contexto completo para desarrollar Tésera con Claude Code (CLI).

## Cómo usarlo

```bash
# 1. Creá el repo vacío y copiá el contenido de este kit en su raíz
mkdir tesera && cd tesera && git init
cp -r /ruta/al/kit/. .

# 2. Abrí Claude Code en la raíz
claude

# 3. Primer prompt
/fase 0
```

Claude Code lee `CLAUDE.md` automáticamente. El resto del contexto está en `docs/`.

## Contenido

- `CLAUDE.md` — reglas, stack, comandos, convenciones (se carga solo)
- `docs/01…11` — arquitectura, frontend, datos, SM, pagos, Shopify (decisión), discreción, panel, SEO/GEO, roadmap, riesgos
- `docs/sm-api/` — documentación oficial de la API de SexShopMayorista (PDF + texto)
- `design/reference/` — pantallas aprobadas (`.dc.html`) y `tienda.css`
- `prisma/schema.prisma` — esquema completo (no se pudo correr `prisma validate` al armarlo: ejecutalo en la Fase 0)
- `src/lib/config.ts` y `src/lib/domain/` — lógica pura con 17 tests pasando
- `.claude/` — permisos, comandos (`/fase`, `/check-discrecion`, `/sm-fixture`) y un subagente revisor de discreción
- `.env.example` — variables de entorno

## Modo de trabajo

Una fase a la vez, con revisión al final de cada una (ver `docs/10-roadmap.md`). Antes de la Fase 3 hay que cerrar las preguntas a SM de `docs/11-riesgos-y-pendientes.md`.

## Nota sobre el scaffolding

El kit no incluye `package.json` ni la app Next.js: la Fase 0 los crea con `create-next-app` y copia `src/lib/` y `prisma/` encima. No hay conflicto: las carpetas del kit son las que el roadmap espera.
