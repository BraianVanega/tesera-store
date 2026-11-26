# Prompt de arranque para Claude Code — Tésera

Pegá esto como primer mensaje en Claude Code, con la terminal abierta en la carpeta del kit (descomprimido).

---

Vas a desarrollar **Tésera**, un sex shop online discreto para Argentina, en Next.js propio (sin Shopify ni Tiendanube). Soy Brai, desarrollador; Eric opera el negocio del día a día (no es socio): cobra un porcentaje de las ganancias al principio, hasta que el negocio se estabilice, y ese esquema puede cambiar. Trabajamos en español.

**Antes de escribir código, leé en este orden:**
1. `CLAUDE.md` (reglas, stack, comandos y pendientes que bloquean fases).
2. `docs/10-roadmap.md` (fases, aceptación y la sección "Segunda parte").
3. `docs/01-arquitectura.md`, `docs/03-modelo-datos.md` y `docs/07-discrecion-y-privacidad.md`.
4. `docs/11-riesgos-y-pendientes.md`.
5. El resto de `docs/` solo cuando la fase lo pida (`04` y `sm-api/` en Fase 3; `05` en Fase 5; `08` en Fase 7; `09` en Fase 9).

**Modo de trabajo:**
- Una fase a la vez. Al terminar: corré `pnpm lint && pnpm typecheck && pnpm test`, tildá la fase en `docs/10-roadmap.md`, resumime qué quedó en pocas líneas y **frená esperando mi OK**. No avances a la siguiente fase por tu cuenta.
- Si algo del kit se contradice o falta una definición, **preguntame**, no lo inventes. Los pendientes conocidos están al final de `CLAUDE.md`.
- No toques `design/reference/`: es la referencia visual. No subas secretos ni datos personales al repo.
- Textos al cliente: sin la palabra "encargo" (es interna). Lo que no está en Mar del Plata dice "Llega en 5 a 10 días" como texto simple; solo "Hoy en Mar del Plata" lleva etiqueta resaltada.

**Empezá por la Fase 0** (`docs/10-roadmap.md`): proyecto base, estructura de carpetas, validación de env con Zod, copiar `prisma/schema.prisma` y `src/lib/domain/` del kit con sus tests, y CI. Corré `pnpm exec prisma validate` y avisame si el esquema tiene errores (no se pudo validar antes). Cuando termines, frená.
