# Implementation Plan: Endpoints de backend que el frontend necesita y hoy no existen

**Branch**: `006-backend-endpoints-faltantes` | **Date**: 2026-09-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/006-backend-endpoints-faltantes/spec.md`

## Summary

`005-frontend-cliente` verificó que 5 grupos de datos que necesita no
tienen ningún endpoint hoy: catálogos de referencia (provincias,
denominaciones simplificadas, tipos de oficina, tipos de UF, fueros),
fuero de un organismo, asignación de jueces por UF (D8), editores de
organismo, y el catálogo completo de preguntas de taxonomía. Esta feature
los agrega — exclusivamente rutas y handlers nuevos sobre tablas que ya
existen (confirmado en research.md, Decisión 1: ninguna migración de
esquema hace falta). El único trabajo de diseño real es cómo traducir los
rechazos de integridad de dos grupos de escritura (asignaciones de
jueces, editores) — que se apoyan en `UNIQUE`/`CHECK`/`FK` simples, no en
triggers como `001`/`003`/`004` — en errores de cliente identificables,
sin repetir el problema de `004` (D11).

## Technical Context

**Language/Version**: Node.js 20 LTS + TypeScript (sin cambios)

**Primary Dependencies**: Fastify (rutas), `pg` (consultas, sin ORM),
`@sinclair/typebox` (validación de bodies) — sin dependencias nuevas

**Storage**: PostgreSQL 17, rol `observatorio_app`, `public.*` — sin
ninguna migración (research.md, Decisión 1)

**Testing**: Vitest contra la base real, mismo criterio que `002`-`004`

**Target Platform**: Linux server (sin cambios)

**Project Type**: Web service (extiende `backend/` ya existente)

**Performance Goals**: N/A explícito — mismo volumen de datos que las
features anteriores, ninguna consulta de esta feature es sensible a
escala en este proyecto

**Constraints**: Los rechazos de integridad de escritura (grupos 3 y 4)
MUST traducirse a un error de cliente identificable — no repetir la clase
de bug que motivó `004` (D11), esta vez para constraints declarativos en
vez de triggers (research.md, Decisión 2)

**Scale/Scope**: 5 catálogos de solo lectura + 1 subruta de solo lectura
(fuero) + 1 recurso CRUD (asignaciones de jueces) + 1 recurso de
alta/baja (editores) + 1 catálogo filtrable (preguntas de taxonomía) — 0
migraciones, 0 reglas de autorización nuevas

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio | Aplica | Evaluación |
|---|---|---|
| I. Soberanía de datos | Sí | Sin cambios. |
| II. Autorización en el servidor | Sí | Los 5 grupos reutilizan reglas ya existentes (`puedeGestionarOrganismo`, `esAdmin`, o "cualquier autenticado" como `localidades`) — cero lógica de autorización nueva (research.md, Decisión 4). PASA. |
| III-V. Autenticación/credenciales/identidad | No aplica | Sin cambios. |
| VI. Autorización desde la fuente | No aplica | No se define ninguna regla nueva. |
| VII. Esquema sobre datos verificados | Sí | Las 12 tablas/vista involucradas se inspeccionaron directamente (`\d`, `\d+`, `pg_trigger`, `enum_range`) antes de diseñar — research.md, Decisión 1. PASA. |
| VIII. Integridad referencial explícita | Sí | Ya garantizada por el esquema (`UNIQUE`/`CHECK`/`FK` en `unidad_funcional_grupo_jueces`/`organismo_editores`) — esta feature no agrega ninguna regla nueva, solo la traduce en la capa de aplicación (research.md, Decisiones 2-3). PASA. |
| IX. Migración por partes | No aplica | No es una fase de migración de sistema. |
| X. Cero pérdida de datos | No aplica | No hay ninguna migración de datos en esta feature. |
| XI. No migrar código muerto | Sí | No aplica directamente (no hay código viejo equivalente que reemplazar) — los 5 grupos son funcionalidad nueva, no una traducción. |
| XII. Trazabilidad | Sí | research.md documenta las 5 decisiones con alternativas consideradas, incluida la confirmación explícita pedida por el usuario sobre la premisa "sin migración". |
| XIII. Secretos fuera del árbol | No aplica | Sin secretos nuevos. |

**Resultado**: PASA sin excepciones que requieran `Complexity Tracking`.

### Re-chequeo post-Fase 1 (tras research.md, data-model.md, contracts/, quickstart.md)

| Principio | Cambió algo en el diseño que afecte la evaluación | Resultado |
|---|---|---|
| II. Autorización en el servidor | No — `contracts/api.md` confirma la composición de Decisión 4 (propietario-o-admin para editores) sigue sin agregar ninguna función de autorización nueva. | PASA |
| VIII. Integridad referencial explícita | No — `data-model.md` documenta las 3 constraints ya existentes que este feature traduce, ninguna se modifica. | PASA |
| XII. Trazabilidad | Reforzado — 5 decisiones documentadas, cada una con alternativas. | PASA |

**Resultado**: PASA. Ninguna decisión de Fase 1 introdujo una violación
nueva.

## Project Structure

### Documentation (this feature)

```text
specs/006-backend-endpoints-faltantes/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
└── contracts/
    └── api.md
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── routes/
│   │   ├── catalogos.ts                # NUEVO — provincias, denominaciones
│   │   │                                # simplificadas, tipos_oficina, tipos_uf,
│   │   │                                # fueros (solo lectura)
│   │   ├── organismos.ts               # MODIFICADO — + GET fuero, + CRUD editores,
│   │   │                                # + CRUD asignaciones de jueces (subruta de UF)
│   │   └── taxonomia.ts                # NUEVO — GET catálogo de preguntas,
│   │                                    # filtrable por tipoOficinaId
│   └── http/
│       └── trigger-error.ts            # MODIFICADO — esRechazoDeIntegridad
│                                        # (generaliza esRechazoDeTrigger, research.md
│                                        # Decisión 2) + tabla de mensajes por
│                                        # constraint (Decisión 3)
└── tests/
    └── contract/
        ├── catalogos.test.ts           # NUEVO
        ├── organismo-fuero.test.ts     # NUEVO
        ├── asignaciones-jueces.test.ts # NUEVO
        ├── organismo-editores.test.ts  # NUEVO
        └── taxonomia-preguntas.test.ts # NUEVO
```

**Structure Decision**: se extiende `backend/` (mismo proyecto de `002`-`004`,
sin proyecto nuevo, sin migración). `catalogos.ts` es el único archivo de
rutas genuinamente nuevo sin "home" temática existente; `taxonomia.ts`
también es nuevo — hasta ahora todo lo de taxonomía vivía como subruta de
`organismos.ts`, pero el catálogo de preguntas no es una subruta de
organismo (es un catálogo propio, filtrable por tipo, no por `:orgId`) —
separarlo es más consistente que forzarlo dentro de `organismos.ts`.
Fuero, editores, y asignaciones de jueces sí son subrutas de organismo/UF
(heredan autorización del padre) y se agregan a `organismos.ts`, mismo
patrón que taxonomía y UF ya establecido ahí.

## Complexity Tracking

*Sin violaciones — tabla omitida.*
