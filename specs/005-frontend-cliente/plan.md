# Implementation Plan: Frontend del Observatorio — cliente que reemplaza la SPA actual

**Branch**: `005-frontend-cliente` | **Date**: 2026-09-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-frontend-cliente/spec.md`
(incluye Clarifications de la sesión 2026-09-24).

## Summary

Cliente web nuevo (`frontend/`) que consume el backend de `002`/`003`/`004`/`006`
sin portar código de la SPA actual. Vite + React + TypeScript + Tailwind v4 +
shadcn/ui (base Radix, inicializado con el CLI de shadcn para Vite), React
Router, TanStack Query, react-hook-form + zod, y el cliente de Better Auth.

Decisiones técnicas que estructuran todo lo demás (detalle en
[research.md](./research.md)):

1. **Cookies en desarrollo: proxy de Vite hacia `/api`, same-origin, sin CORS
   nuevo en el backend.** Reverificado el 2026-09-24 contra el árbol actual
   (con `006` mergeada): el backend sigue sin CORS ni `trustedOrigins`, y
   Better Auth valida el `Origin` de los `POST` con cookie. El proxy debe
   quedar sin `changeOrigin` y el backend en dev corre con
   `BETTER_AUTH_URL=http://localhost:5173`. Se valida con un spike antes de
   construir pantallas (quickstart, escenario 0).
2. **shadcn con Vite ≠ receta de Next.js**: Tailwind v4 con
   `@tailwindcss/vite`, alias `@/*` en **dos** tsconfig, `components.json`
   con `rsc:false`, y `npx shadcn@latest init --template vite`.
3. **Capa de mapeo por recurso (D13)**: un esquema zod por recurso valida la
   respuesta, normaliza casing a camelCase y convierte el id de usuario
   `string → number` — un solo mecanismo. Las pantallas solo ven tipos de
   dominio.
4. **Las 7 decisiones de la spec** se reflejan así: US9 solo lectura;
   mensaje de login único; sin "fijar contraseña"; **sin ruta ni menú de
   pools** (todo en el diálogo de asignación de una UF); **sin registro**;
   provincia editable solo para admin; taxonomía sin preguntas aplicables =
   completa.

Hallazgos nuevos de esta corrida (no estaban en la anterior):

- **G5 / D14**: el alta de usuarios no está controlada en el backend; el
  cliente no ofrece registro, pero el cierre real es de `007`. El cliente
  queda preparado para el rechazo futuro con un mensaje genérico.
- **G6**: `DELETE /api/pools-jueces/:id` de un pool asignado responde `500`
  (FK sin `ON DELETE`, ruta sin captura). El diálogo lo traduce a un mensaje
  claro; la corrección real es de `007`.

## Technical Context

**Language/Version**: TypeScript 5.x (strict), React 19; Node 20+ para tooling.

**Primary Dependencies**: Vite 8.3, React 19.3, Tailwind CSS 4.3 +
`@tailwindcss/vite`, shadcn/ui (CLI 4.21, base `radix`), React Router 8,
`@tanstack/react-query` 5, `react-hook-form` 7 + `zod` 4 +
`@hookform/resolvers`, `better-auth` 1.7.5 (cliente, misma versión que el
backend) con `magicLinkClient()`, `jspdf` 4.2 + `jspdf-autotable` 5.0.
Versiones de `npm view` al 2026-09-23; se fijan en el lockfile.

**Storage**: N/A — el cliente no persiste datos ni tokens. `localStorage` solo
para preferencias de UI (tema, sidebar), siempre en try/catch.

**Testing**: Vitest + Testing Library (esquemas de mapeo, esquema dinámico de
taxonomía, guardas, completitud); Playwright E2E contra **backend real** y
base de pruebas (sin mocks del backend, mismo criterio que `backend/`), con
mocks de red solo para casos no reproducibles (sesión vencida, `500` del
borrado de pool, magic link).

**Target Platform**: navegadores evergreen, escritorio primero; utilizable en
móvil (sidebar → `sheet`).

**Project Type**: web application — frontend nuevo sobre un backend existente.

**Performance Goals**: sin metas numéricas en la spec. Regla práctica: sin
recargas completas en flujos interactivos; la vista de completitud admin
(≈ 250–350 requests para 117 organismos) muestra progreso y es usable
mientras carga (concurrencia 6; catálogo de taxonomía pedido una vez por tipo).

**Constraints**: `401`/`403`/`404` tratados de forma distinta y visible
(FR-020, FR-021); autorización real solo en el servidor (Principio II);
rutas relativas `/api` (mismo origen en dev vía proxy y en prod); ningún
secreto en el árbol (`VITE_*` solo para la URL pública de DataStudio).

**Scale/Scope**: 11 pantallas (login, lista, alta, detalle con 4 pestañas,
UF + diálogo de asignación/pools, taxonomía, editores, perfil, ajustes,
completitud admin, usuarios admin) + 403/404; 117 organismos, ~47 usuarios,
24 jurisdicciones.

## Constitution Check

*GATE: pasa antes de Phase 0; re-evaluado después de Phase 1.*

| Principio | Estado | Cómo se cumple / nota |
|---|---|---|
| I. Soberanía de datos | ✅ | Sin dependencia de GCP en la ruta crítica. DataStudio es solo un enlace externo (FR-015): si `VITE_DATASTUDIO_URL` falta o el servicio cae, la app opera igual. |
| II. Autorización en el servidor | ✅ | Guardas de ruta y controles deshabilitados son UX; toda operación depende del `401`/`403` del backend, que la UI muestra sin degradar. "Provincia fija" y "sin `/pools`" son UX, no control de acceso. No existe campo "propietario" (FR-004). |
| III. Autenticación plural | ✅ | Tres métodos, ninguno prerequisito de otro; la pantalla no oculta uno si otro falla. |
| IV. Credenciales y tokens seguros | ✅ | Cookie `httpOnly` gestionada por el navegador; sin tokens en JS ni storage; el cliente no loguea contraseñas. El mensaje de login único **refuerza** el principio (no revela existencia ni estado de la cuenta — FR-002). |
| V. Identidad unificada | ✅ | El cliente no crea identidades: sin pantalla de registro (FR-022). Que el backend aún acepte altas directas es **D14** (resuelta por diseño, a implementar en `007`); el frontend no es una barrera (Principio II) y no se presenta como tal. |
| VI. Autorización desde la fuente | N/A | No se redefinen reglas; el cliente refleja las del backend (p. ej. un editor no gestiona editores). |
| VII. Esquema sobre datos verificados | ✅ | Formas de respuesta leídas del código real; el esquema zod detecta deriva en ejecución; brechas G1–G6 con evidencia. Lo no verificable sin correr el sistema está marcado *"a validar en quickstart"*. |
| VIII. Integridad referencial | N/A | Sin esquema propio. El hallazgo G6 (FK sin `ON DELETE`) se documenta, no se corrige acá. |
| IX. Migración por partes | ✅ | `frontend/` nuevo; `src/` intacto y operativo; el corte de despliegue queda fuera. |
| X. Cero pérdida de datos | ✅ | Sin migración. El `PUT` de taxonomía **reemplaza** el conjunto: el formulario siempre envía el conjunto completo y las pruebas E2E verifican que guardar no borra respuestas existentes. |
| XI. Código muerto no se migra | ✅ | Nada de `src/` se reutiliza. |
| XII. Trazabilidad | ✅ | research.md cita fuente y fecha por decisión; las desviaciones y aplazamientos (G1–G6) registran qué hace el backend y por qué. |
| XIII. Secretos fuera del árbol | ✅ | Solo `VITE_DATASTUDIO_URL` (pública) en `.env.local`; credenciales de Google y base pertenecen al backend por variables de entorno. |

**Re-evaluación post-diseño (Phase 1)**: sin violaciones nuevas. El diseño
del diálogo de pools (decisión 4) no crea ninguna superficie de acceso nueva:
usa los endpoints de `002` con su autorización por provincia.

## Project Structure

### Documentation (this feature)

```text
specs/005-frontend-cliente/
├── plan.md                 # este archivo
├── research.md             # Phase 0
├── data-model.md           # Phase 1 (tipos, mapeo, validaciones, estado)
├── quickstart.md           # Phase 1 (27 escenarios de validación)
├── contracts/
│   ├── consumed-api.md     # forma wire de cada endpoint + mapeo
│   └── routes.md           # rutas, guardas, pantallas
├── checklists/requirements.md
└── tasks.md                # Phase 2 (/speckit-tasks — no lo crea este comando)
```

### Source Code (repository root)

```text
frontend/
├── index.html
├── package.json / package-lock.json
├── vite.config.ts              # plugins react + tailwind, alias @, proxy /api (sin changeOrigin)
├── tsconfig.json / tsconfig.app.json   # alias @/* en AMBOS
├── components.json             # shadcn (rsc:false, tailwind.config:"")
├── .env.example                # VITE_DATASTUDIO_URL (sin secretos)
├── src/
│   ├── main.tsx · App.tsx · index.css        # @import "tailwindcss"
│   ├── api/                    # cliente fetch + un módulo por recurso, cada uno con su esquema zod (wire → dominio)
│   │   ├── http.ts             # rutas relativas, manejo de 204/401/403, error tipado
│   │   ├── ids.ts              # usuarioIdDesdeWire (string → number, safe integer)
│   │   ├── auth-client.ts      # better-auth/client + magicLinkClient
│   │   └── organismos.ts · unidades.ts · asignaciones.ts · pools.ts · editores.ts
│   │       taxonomia.ts · usuarios.ts · catalogos.ts · sesion.ts
│   ├── auth/                   # useSesion, guardas RequireAuth / RequireAdmin
│   ├── routes/                 # una carpeta por pantalla (login, organismos, admin, perfil…)
│   ├── features/
│   │   ├── taxonomia/          # esquema zod en runtime y controles por tipoRespuesta
│   │   ├── asignaciones/       # diálogo de asignación de jueces: asignar + gestionar pools (único lugar)
│   │   └── completitud/        # fan-out con concurrencia + export PDF
│   ├── components/
│   │   ├── ui/                 # generados por shadcn
│   │   └── layout/             # sidebar, menú de usuario, breadcrumbs
│   └── lib/utils.ts            # cn()
└── tests/
    ├── unit/                   # esquemas de mapeo, esquema de taxonomía, guardas, completitud
    └── e2e/                    # Playwright contra backend real

backend/     # sin cambios
src/         # SPA vieja, sin cambios
```

**Structure Decision**: web application con `frontend/` nuevo al lado de
`backend/` y la SPA vieja intacta (research.md, Decisión 1). No hay
`routes/pools` ni `routes/registro` a propósito.

## Riesgos y dependencias fuera de esta feature

| Riesgo / dependencia | Efecto | Mitigación |
|---|---|---|
| **`007-backend`** (prioridad según D14: alta controlada → cambio de rol → fijar contraseña → `DELETE` de pool con `400`) | US9 queda en lectura (G1); sin "fijar contraseña" (G3); alta de usuarios sin cierre (G5); borrado de pool asignado da `500` (G6) | Cada limitación tiene comportamiento definido en la spec y en el cliente; nada queda a medias |
| D14 aún no implementada | Cualquiera puede crear identidad por la API | El cliente no la ofrece y queda preparado para el rechazo (mensaje genérico, `?error=`); no se declara al frontend como control |
| G4 magic link sin email real | SC-001 no verificable por usuarios reales | Flujo completo en el cliente; el link sale del log del backend en dev |
| D5 topología de despliegue | En producción `/api` debe ser del mismo origen; hoy `vercel.json` reescribe `/(.*)` a `index.html` | Rutas relativas; la regla de rewrite/reverse proxy es tarea de despliegue |
| Google OAuth sin probar de punta a punta (README de `002`) | El escenario 2 puede revelar problemas de `redirect_uri` | Credencial de desarrollo con redirect `:5173`; validar temprano |
| Mensajes de error de taxonomía sin campo estructurado | Asociar el error a una pregunta depende del texto | Resaltar por `codigo`/`texto` en el mensaje + mensaje completo junto al formulario; validar contra los triggers reales |
| Completitud admin ≈ 250–350 requests | Lento en frío | Concurrencia 6, progreso visible, catálogo por tipo cacheado; endpoint agregado como mejora futura |
| Usuario editor de otra provincia en el diálogo de pools | No ve ni crea pools de la provincia del organismo (403 del backend) | El diálogo lo explica y muestra las asignaciones existentes por id |
| Nombres de componentes shadcn cambiantes | Diferencias entre la doc y el CLI | `shadcn add` falla explícitamente ante un nombre inexistente; se resuelve al instalar |

## Preguntas abiertas

Ninguna que bloquee `/speckit-tasks`. Las 7 decisiones pendientes están
resueltas en la spec. Puntos a **validar durante la implementación** (no son
decisiones): spike de cookies (escenario 0), redirect de Google, mensajes
reales de los triggers de taxonomía y nombres exactos de los componentes
shadcn.

## Complexity Tracking

Sin violaciones de la constitución que justificar.
