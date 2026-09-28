# Implementation Plan: Editar los fueros de un organismo

**Branch**: `011-crud-fueros-organismo` | **Date**: 2026-09-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/011-crud-fueros-organismo/spec.md`

## Summary

Agregar el único camino de escritura que falta sobre `organismo_fueros`
(`PUT /api/organismos/:orgId/fuero`, mismo path que el `GET` ya existente,
reemplazo completo del listado — mismo patrón que ya usa el `PUT` de
taxonomía) y reemplazar el texto de solo lectura de `DatosTab.tsx` por un
control de casillas sobre el catálogo real de fueros. La autorización es
la que ya protege el resto de los datos del organismo
(`autorizarContraOrganismoPadre` → `puedeGestionarOrganismo` →
`esOwnerOEditor() || esAdmin()`), sin ninguna regla nueva. Un chequeo antes
de escribir bloquea con `400` cualquier intento de sacar un fuero que una
asignación de jueces (`asignacion_fueros`) ya acota específicamente
(FR-004/Historia 2, Principio VIII). El relleno inicial que pidió el
usuario para datos migrados queda como un script de una sola vez, aparte
del endpoint — investigado a fondo en research.md: hoy no tiene ningún
caso real que rellenar (verificado contra la base), y el propio esquema no
conserva de dónde sacar "el valor único" si el caso apareciera, así que
queda como un detector de anomalía, no un rellenador con una fuente real.

## Technical Context

**Language/Version**: TypeScript (backend Fastify 5 + Node; frontend Vite/React 19) — mismo stack ya establecido, sin cambios.

**Primary Dependencies**: ninguna nueva. Backend: `pg`, `@sinclair/typebox` (ya usados). Frontend: `react-hook-form`, `zod`, componentes `ui/checkbox` (shadcn, ya instalado — usado hoy por `TaxonomiaForm.tsx` para preguntas de opción múltiple, mismo patrón de control que esta pantalla necesita).

**Storage**: PostgreSQL existente — sin migración ni tabla nueva. `organismo_fueros`, `fueros`, `vista_fuero_simplificado` y el trigger `asignacion_fuero_dentro_de_uf` ya existen (`db/schema.sql`); esta feature solo agrega un endpoint de escritura sobre datos ya modelados.

**Testing**: `vitest` (contract/integration backend, ya establecido — extiende `backend/tests/contract/organismo-fuero.test.ts`; unit frontend, extiende el patrón de `DatosTab`/`TaxonomiaForm`).

**Target Platform**: Linux server (mismo backend/frontend ya desplegados en desarrollo).

**Project Type**: Web application (backend Fastify + frontend Vite/React, ya establecido).

**Performance Goals**: N/A — un `PUT` sobre una relación de a lo sumo unas pocas filas (el catálogo de fueros es chico), sin meta de throughput.

**Constraints**: la autorización MUST ser exactamente `autorizarContraOrganismoPadre` (FR-006) — no una regla nueva ni más angosta (a diferencia de "editores", que sí usa una regla propia, research.md Decisión 1). El bloqueo de FR-004 MUST ser atómico con el reemplazo del listado — no puede quedar un estado a medias si el chequeo y la escritura corrieran por separado.

**Scale/Scope**: 118 organismos, ≤ 21 con fueros sin poblar (research.md Decisión 3, verificado contra la base real) — sin problema de volumen en ningún sentido.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio | Aplica | Cómo se cumple |
|---|---|---|
| II. La autorización vive en el servidor | Sí | El control de fueros en el frontend es UX; el servidor decide con la misma regla ya vigente (`autorizarContraOrganismoPadre`), no una nueva. |
| VII. El esquema se diseña sobre datos verificados | Sí | El relleno inicial (research.md Decisión 3) se investigó contra la base real antes de diseñar el script — no se asumió que el caso descrito existiera. |
| VIII. Integridad referencial explícita | Sí | FR-004 hace explícito, en el propio endpoint, lo que el trigger de `asignacion_fueros` no cubre (solo valida INSERT/UPDATE, no protege contra un `DELETE` del lado de `organismo_fueros`) — Principio VIII pide que la integridad sea explícita, no implícita en un trigger parcial. |
| XII. Trazabilidad de decisiones | Sí | research.md documenta la verificación del relleno inicial y el rediseño del script de "rellenar" a "detectar", con su motivo. |

Sin violaciones. No hace falta Complexity Tracking.

**Re-chequeo post-diseño (tras research.md/data-model.md/contracts/):** sin
cambios — ninguna decisión de diseño agregó una regla de autorización
nueva, una migración, ni un rellenado de datos sin fuente verificada. Sigue
sin violaciones.

## Project Structure

### Documentation (this feature)

```text
specs/011-crud-fueros-organismo/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── contracts/
│   └── api.md            # Phase 1 output
├── quickstart.md         # Phase 1 output
└── tasks.md              # Phase 2 (/speckit-tasks — no generado acá)
```

### Source Code (repository root)

```text
backend/
├── src/
│   └── routes/
│       └── organismos.ts          # MODIFICADO — agrega PUT /api/organismos/:orgId/fuero
├── scripts/
│   └── detectar-fueros-sin-poblar.ts  # NUEVO — detector de una sola vez (research.md Decisión 3)
└── tests/
    └── contract/
        └── organismo-fuero.test.ts    # MODIFICADO — cubre el PUT nuevo (éxito, bloqueo FR-004, autorización)

frontend/
├── src/
│   ├── api/
│   │   └── fuero.ts                # MODIFICADO — mutación para el PUT nuevo
│   └── routes/organismos/
│       └── DatosTab.tsx             # MODIFICADO — reemplaza el texto de solo lectura por casillas
└── tests/
    └── unit/routes/
        └── datos-tab.test.tsx       # NUEVO (o extiende el existente si ya cubre DatosTab) — cubre el control nuevo
```

**Structure Decision**: se mantiene la estructura ya establecida. Esta
feature es un endpoint nuevo + una pantalla existente que gana un control
— sin rutas nuevas de frontend, sin tablas nuevas.
