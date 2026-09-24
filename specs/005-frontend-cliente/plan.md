# Implementation Plan: Frontend del Observatorio — cliente que reemplaza la SPA actual

**Branch**: `005-frontend-cliente` | **Date**: 2026-09-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-frontend-cliente/spec.md`

## Summary

Cliente web nuevo (`frontend/`) que consume el backend de `002`/`003`/`004`/`006`
sin portar código de la SPA actual. Vite + React + TypeScript + Tailwind v4 +
shadcn/ui (base Radix), ruteo con React Router, datos con TanStack Query,
formularios con react-hook-form + zod, auth con el cliente de Better Auth.

Tres decisiones de esta investigación condicionan todo lo demás
(detalle en [research.md](./research.md)):

1. **Cookies en desarrollo: proxy de Vite, no CORS.** El backend no tiene CORS
   ni `trustedOrigins`; un cliente en otro puerto fallaría en el preflight y
   en el origin check de Better Auth. El cliente usa rutas relativas `/api`,
   Vite hace proxy sin `changeOrigin`, y el backend corre con
   `BETTER_AUTH_URL=http://localhost:5173`. Se valida con un spike antes de
   construir pantallas (quickstart, escenario 0).
2. **shadcn con Vite = Tailwind v4 + `@tailwindcss/vite` + alias en dos
   tsconfig + `shadcn init --template vite`**, no la receta de Next.js.
3. **Las formas reales de las respuestas no están en los `contracts/api.md`
   de `006`** — se leyeron del código y se fijaron en
   [contracts/consumed-api.md](./contracts/consumed-api.md). Hay casing mixto
   (snake/camel), ids `bigint` como string, y dos formas distintas para
   taxonomía (catálogo vs. respuestas) que el formulario debe combinar.

**Hallazgo que requiere decisión antes de `/speckit-tasks`**: la verificación
contra el código real encontró **4 brechas** entre lo que la spec asume y lo
que el backend permite (research.md, Decisión 5). Dos afectan un FR:

- **G1** — no hay endpoint para **cambiar el rol** de un usuario → FR-019 solo
  se cumple en lectura.
- **G2/G3** — la revocación de contraseña **no es distinguible** de una
  contraseña errónea, y **no hay forma de fijar una contraseña nueva** desde
  el cliente → FR-002 y parte de FR-014 no se pueden cumplir a la letra.
- G4 — el magic link no se envía por email (ya documentado en `002`).

## Technical Context

**Language/Version**: TypeScript 5.x (strict), React 19; Node 20+ para
tooling.

**Primary Dependencies**: Vite 8.3, React 19.3, Tailwind CSS 4.3 +
`@tailwindcss/vite`, shadcn/ui (CLI 4.21, base `radix`), React Router 8,
`@tanstack/react-query` 5, `react-hook-form` 7 + `zod` 4 +
`@hookform/resolvers`, `better-auth` 1.7.5 (cliente, misma versión que el
backend) con `magicLinkClient()`, `jspdf` 4.2 + `jspdf-autotable` 5.0.
Versiones de `npm view` al 2026-09-23; se fijan en el lockfile.

**Storage**: N/A — el cliente no persiste datos ni tokens. `localStorage` solo
para preferencias de UI (tema, sidebar), siempre en try/catch.

**Testing**: Vitest + Testing Library (mappers, esquema dinámico de taxonomía,
guardas de ruta, componentes); Playwright E2E contra **backend real** y base
de pruebas (sin mocks del backend — mismo criterio que `backend/`), con
mocks de red solo para casos no reproducibles (sesión vencida a mitad de
formulario).

**Target Platform**: navegadores evergreen, escritorio primero; utilizable en
móvil (sidebar → `sheet`).

**Project Type**: web application — frontend nuevo consumiendo un backend
existente.

**Performance Goals**: sin metas numéricas en la spec. Regla práctica: lista
de organismos y formularios interactivos sin recargas completas; la vista de
completitud admin (≈ 350 requests, 117 organismos) debe mostrar progreso y
ser usable mientras carga (concurrencia 6).

**Constraints**: 401/403/404 tratados de forma distinta y visible (FR-020,
FR-021); autorización real solo en el servidor (Principio II); sin secretos
en el árbol (`VITE_*` no admite secretos — solo la URL pública de DataStudio);
cliente API con rutas relativas (mismo origen en dev vía proxy y en prod).

**Scale/Scope**: 12 pantallas (login, lista, alta, detalle con 4 pestañas,
UF + asignaciones, taxonomía, editores, pools, perfil, ajustes, completitud
admin, usuarios admin) + 403/404; 117 organismos, ~46 usuarios, 24
jurisdicciones (datos de `001`).

## Constitution Check

*GATE: pasa antes de Phase 0; re-evaluado después de Phase 1.*

| Principio | Estado | Cómo se cumple / nota |
|---|---|---|
| I. Soberanía de datos | ✅ | Sin dependencia de GCP en la ruta crítica. DataStudio es **solo un enlace externo** (FR-015), nunca una dependencia funcional: si `VITE_DATASTUDIO_URL` falta o el servicio cae, la app opera igual. |
| II. Autorización en el servidor | ✅ | Guardas de ruta y controles ocultos son UX; toda operación depende del `401`/`403` del backend y la UI los muestra sin degradar. El campo "propietario" no existe en ningún formulario (FR-004). |
| III. Autenticación plural | ✅ | Tres métodos, ninguno prerequisito de otro; la pantalla no oculta uno si otro falla. |
| IV. Credenciales/tokens seguros | ✅ | Cookie `httpOnly` manejada por el navegador; nada de tokens en JS ni storage; magic link de un solo uso lo resuelve el backend. El cliente nunca loguea contraseñas. |
| V. Identidad unificada | ✅ con nota | No se agrega pantalla de registro con contraseña (G/Dec. 8) para no crear cuentas no verificadas. Confirmar. |
| VI. Modelo de autorización desde la fuente | N/A | No se redefinen reglas; el cliente refleja las del backend (p. ej. editor sin permiso sobre editores, research Dec. 5). |
| VII. Esquema sobre datos verificados | ✅ | Formas de respuesta leídas del código real, no supuestas; brechas documentadas con evidencia. Lo no verificable sin correr el sistema está marcado "a validar en quickstart". |
| VIII. Integridad referencial | N/A | Sin esquema propio. |
| IX. Migración por partes | ✅ | `frontend/` nuevo, `src/` intacto y operativo; corte de despliegue fuera de esta feature. |
| X. Cero pérdida de datos | N/A | Sin migración de datos. Nota: el `PUT` de taxonomía **reemplaza** el conjunto; el formulario siempre envía el conjunto completo para no borrar respuestas por omisión. |
| XI. Código muerto no se migra | ✅ | Nada de `src/` se reutiliza. |
| XII. Trazabilidad | ✅ | research.md cita fuente/fecha por decisión; las desviaciones de la spec (G1–G3) están registradas con qué hace el backend y por qué. |
| XIII. Secretos fuera del árbol | ✅ | Solo `VITE_DATASTUDIO_URL` (pública) en `.env.local`; credenciales de Google/DB pertenecen al backend por variables de entorno. |

**Re-evaluación post-diseño (Phase 1)**: sin violaciones nuevas. Los puntos
abiertos abajo son decisiones de alcance, no violaciones.

## Project Structure

### Documentation (this feature)

```text
specs/005-frontend-cliente/
├── plan.md                 # este archivo
├── research.md             # Phase 0
├── data-model.md           # Phase 1 (tipos y estado del cliente)
├── quickstart.md           # Phase 1 (escenarios de validación)
├── contracts/
│   ├── consumed-api.md     # formas reales de respuesta de cada endpoint
│   └── routes.md           # rutas, guardas, pantallas
├── checklists/requirements.md
└── tasks.md                # Phase 2 (/speckit-tasks — no lo crea este comando)
```

### Source Code (repository root)

```text
frontend/
├── index.html
├── package.json / package-lock.json
├── vite.config.ts              # plugins react + tailwind, alias @, proxy /api
├── tsconfig.json / tsconfig.app.json   # alias @/* en AMBOS
├── components.json             # shadcn (rsc:false, tailwind.config:"")
├── .env.example                # VITE_DATASTUDIO_URL (sin secretos)
├── src/
│   ├── main.tsx · App.tsx · index.css        # @import "tailwindcss"
│   ├── api/                    # cliente fetch + un módulo por recurso + mappers snake→camel
│   │   ├── http.ts             # rutas relativas, manejo 204/401/403, error tipado
│   │   ├── auth-client.ts      # better-auth/client + magicLinkClient
│   │   └── organismos.ts · unidades.ts · asignaciones.ts · pools.ts · editores.ts
│   │       taxonomia.ts · usuarios.ts · catalogos.ts · sesion.ts
│   ├── auth/                   # useSesion, guardas RequireAuth / RequireAdmin
│   ├── routes/                 # una carpeta por pantalla (login, organismos, admin, perfil…)
│   ├── features/
│   │   ├── taxonomia/          # construcción del esquema zod y controles por tipoRespuesta
│   │   ├── asignaciones/       # atajos exclusivo / pool completo / subconjunto
│   │   └── completitud/        # fan-out con concurrencia + export PDF
│   ├── components/
│   │   ├── ui/                 # generados por shadcn
│   │   └── layout/             # sidebar, menú de usuario, breadcrumbs
│   └── lib/utils.ts            # cn()
└── tests/
    ├── unit/                   # mappers, esquema taxonomía, guardas
    └── e2e/                    # Playwright contra backend real

backend/     # sin cambios (dependencias: ver Riesgos)
src/         # SPA vieja, sin cambios
```

**Structure Decision**: Option 2 (web application) con `frontend/` nuevo al
lado de `backend/` y la SPA vieja intacta (research.md, Decisión 1).

## Riesgos y dependencias fuera de esta feature

| Riesgo / dependencia | Efecto | Mitigación |
|---|---|---|
| Rama sin `006` | No se puede correr el sistema completo | `git merge reformulacion` antes de implementar |
| G1 sin endpoint de rol | US9 queda en lectura | Proponer `007-backend-...` (rol + fijar contraseña) |
| G2/G3 (contraseña) | FR-002 cumplido de forma aproximada; sin "fijar contraseña nueva" | Mensaje ante cualquier fallo de credencial; `changePassword` solo con credencial existente |
| G4 magic link sin email | SC-001 no verificable por usuarios reales | Flujo listo en cliente; link desde log en dev; requiere decidir proveedor de email |
| D5 topología de despliegue | En producción `/api` debe ser del mismo origen; hoy `vercel.json` reescribe `/(.*)` a `index.html` | Rutas relativas en el cliente; regla de rewrite/reverse proxy es tarea de despliegue |
| Google OAuth de punta a punta sin probar (README `002`) | Escenario 2 puede revelar problemas de `redirect_uri` | Credencial de desarrollo con redirect `:5173`; validarlo temprano |
| Completitud admin: ~350 requests | Lento en frío | Concurrencia limitada + progreso; endpoint agregado como mejora futura de backend |
| Casing/ids inconsistentes del backend | Errores sutiles (`"12"` vs `12`) | Capa `api/` con tipos y mappers únicos; tests unitarios |

## Preguntas abiertas (necesitan tu confirmación antes de `/speckit-tasks`)

1. **G1 — cambio de rol (FR-019)**: ¿US9 entra en modo *solo lectura* con el control deshabilitado, hasta que exista `007`? (Recomendado.) ¿O se pospone US9 entera?
2. **G2 — FR-002**: ¿aceptás el mensaje "explicativo ante cualquier fallo de contraseña" en lugar de detectar la revocación (que el backend no permite distinguir)? ¿O preferís pedirle al backend un código distinguible (con el costo de facilitar la enumeración de cuentas)?
3. **G3 — fijar contraseña nueva**: ¿se difiere a `007` (junto con G1)?
4. **Pools como sección propia del menú** (`/pools`), o solo dentro del diálogo de asignación de jueces.
5. **Registro con contraseña**: confirmar que no hay pantalla de alta de cuenta (usuarios nuevos entran por Google o magic link).
6. **Provincia en el alta para admin**: ¿editable (supuesto) o también fija?
7. **Completitud de taxonomía** para tipos sin preguntas aplicables: ¿cuentan como "completos" (supuesto) o "no aplica"?

## Complexity Tracking

Sin violaciones de la constitución que justificar.
