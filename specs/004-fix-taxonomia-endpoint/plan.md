# Implementation Plan: Endpoint de taxonomía de organismos, reconstruido para el modelo parametrizable

**Branch**: `004-fix-endpoint-taxonomia` | **Date**: 2026-09-22 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-fix-taxonomia-endpoint/spec.md`

## Summary

`GET`/`PUT /api/organismos/:orgId/taxonomia` quedaron rotos cuando
`003-taxonomia-parametrizable` reformuló `evaluaciones_taxonomicas` de 9
columnas fijas a una tabla de respuestas parametrizable. Esta feature los
reconstruye contra el esquema real (lectura agrupada por pregunta con
texto/tipo incluido; reemplazo atómico completo por organismo, con errores
de rechazo traducidos a un error de cliente identificable), y agrega dos
protecciones de integridad hacia adelante relacionadas con el caso
histórico de OGA Mediación (organismo id=311): un trigger nuevo
(Protección A, migración `0003`) que impide guardar una respuesta *nueva*
para una pregunta que no aplica al tipo actual del organismo, y una
verificación de aviso/confirmación (Protección B) en
`PATCH /api/organismos/:id` que impide perder taxonomía por un cambio de
tipo sin que el cliente lo confirme explícitamente. Sin cambios de stack:
mismo backend Node.js 20/TypeScript/Fastify, mismo mecanismo de
migraciones (`Migrator` de Kysely) y mismo acceso a datos (`pg` directo,
sin ORM) ya establecidos en `002-backend-api-carga-datos` y
`003-taxonomia-parametrizable`.

## Technical Context

**Language/Version**: Node.js 20 LTS + TypeScript (sin cambios — mismo backend de `002`/`003`)

**Primary Dependencies**: Fastify (rutas), `pg` (consultas de dominio, sin ORM), Kysely (solo para la migración `0003`, mismo uso que `0001`/`0002`), `@sinclair/typebox` (validación de request bodies)

**Storage**: PostgreSQL 17 self-hosted, rol `observatorio_app`, esquema `public.*` (sin tocar `auth.*`)

**Testing**: Vitest contra la base real (sin mocks — mismo criterio que `002`/`003`), `db/validation/*.sql` para la guarda de esquema (Protección A)

**Target Platform**: Linux server (sin cambios)

**Project Type**: Web service (backend ya existente, `backend/`)

**Performance Goals**: N/A explícito — mismo volumen de datos que `003` (117 organismos, 9 preguntas, ~801 respuestas); ninguna consulta de esta feature es sensible a escala en este proyecto

**Constraints**: Ninguna transacción de escritura ya aplicada por esta feature debe dejar datos a medio aplicar (FR-006, FR-020) — primera vez que la capa de aplicación (no solo la base) necesita una transacción explícita multi-sentencia (ver research.md, Decisión 3)

**Scale/Scope**: 2 endpoints reconstruidos (`GET`/`PUT` taxonomía) + 1 endpoint existente extendido (`PATCH /api/organismos/:id`) + 1 migración de esquema nueva (`0003`, un trigger + una función)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio | Aplica | Evaluación |
|---|---|---|
| I. Soberanía de datos | Sí | Sin cambios — sigue sin dependencia de GCP. |
| II. Autorización en el servidor | Sí | `GET`/`PUT` taxonomía y la rama de Protección B de `PATCH /api/organismos/:id` reutilizan `autorizarContraOrganismoPadre`/`puedeGestionarOrganismo` ya existentes — cero lógica de autorización nueva (FR-012 de este spec). PASA. |
| III. Autenticación plural | No aplica | Esta feature no toca autenticación. |
| IV. Credenciales seguras | No aplica | Sin credenciales nuevas. |
| V. Identidad unificada | No aplica | Sin cambios de identidad. |
| VI. Autorización desde la fuente | No aplica | No se define ninguna regla de autorización nueva — se reutiliza la ya reconstruida en `002` desde `docs/firestore-rules-actuales.rules`. |
| VII. Esquema sobre datos verificados | Sí | Las 4 filas de `tipos_oficina` y el caso real de id=311 se verificaron contra la base antes de diseñar (ver research.md). PASA. |
| VIII. Integridad referencial explícita | Sí | Es el corazón de la Protección A: un trigger, mismo patrón que `003`, para una regla que hoy no tiene ninguna garantía de esquema. PASA — sin este trigger, esta feature quedaría con la misma clase de gap que motivó su alcance ampliado. |
| IX. Migración por partes | No aplica | No es una fase de migración de sistema — es una corrección de un endpoint ya migrado. |
| X. Cero pérdida de datos, con reconciliación | Evaluado, no aplica en el sentido estricto | La Protección B elimina datos reales (respuestas huérfanas tras un cambio de tipo confirmado). Esto **no** es una "migración de datos" en el sentido del principio (mover datos de un origen a un destino) — es una operación de escritura ordinaria de la API, explícitamente confirmada por un usuario autorizado, de la misma naturaleza que `DELETE /api/organismos/:id` (ya existente, sin reconciliación) o `DELETE /unidades-funcionales/:ufId` (ídem). No se le exige un log de reconciliación por el mismo motivo que no se le exige a esos deletes ya existentes. Lo que SÍ exige el espíritu del principio — no perder datos sin que nadie lo note — lo cubre FR-018/FR-019 (aviso previo obligatorio, nunca un borrado silencioso). PASA con esta aclaración explícita. |
| XI. No migrar código muerto | Sí | Se reemplaza la implementación rota de `PUT`/`GET` taxonomía en vez de conservarla junto a la nueva. PASA. |
| XII. Trazabilidad de decisiones | Sí | research.md documenta la decisión de la función SQL reutilizable, el mecanismo de transacción, el mapeo de errores, y por qué esto es una migración `0003` nueva y no un ajuste a `0001`/`0002` (mismo criterio ya sentado en `003`, Decisión 5). |
| XIII. Secretos fuera del árbol | No aplica | Sin secretos nuevos. |

**Resultado**: PASA sin excepciones que requieran `Complexity Tracking`.

### Re-chequeo post-Fase 1 (tras research.md, data-model.md, contracts/, quickstart.md)

| Principio | Cambió algo en el diseño que afecte la evaluación | Resultado |
|---|---|---|
| II. Autorización en el servidor | No — `contracts/api.md` confirma que los 3 endpoints reutilizan `esOwnerOEditor()`/`esAdmin()` sin variante. | PASA |
| VIII. Integridad referencial explícita | No — el trigger de la Protección A quedó dry-run-probado (contracts/migration-0003-taxonomia-tipo-organismo.sql: rechazo, control positivo, y no-afecta-id=311, los 3 verdes contra la base real). | PASA |
| X. Cero pérdida de datos | No — `contracts/api.md` deja explícito que Protección B nunca borra sin el aviso previo obligatorio (400 + `preguntasQueSePerderian`), igual que se evaluó antes de la Fase 1. | PASA |
| XI. No migrar código muerto | No — `data-model.md` confirma que `GET`/`PUT` taxonomía viejos (9 columnas) se reemplazan, no coexisten. | PASA |
| XII. Trazabilidad | Reforzado — research.md quedó con 5 decisiones documentadas, cada una con alternativas consideradas. | PASA |

**Resultado**: PASA. Ninguna decisión de Fase 1 introdujo una violación
nueva ni cambió la evaluación de Fase 0.

## Project Structure

### Documentation (this feature)

```text
specs/004-fix-taxonomia-endpoint/
├── plan.md              # Este archivo
├── research.md          # Fase 0
├── data-model.md         # Fase 1
├── quickstart.md         # Fase 1
├── contracts/            # Fase 1
│   ├── api.md
│   └── migration-0003-taxonomia-tipo-organismo.sql
└── tasks.md              # Fase 2 (/speckit-tasks, no este comando)
```

### Source Code (repository root)

```text
backend/
├── migrations/
│   └── 0003_taxonomia_tipo_organismo.ts      # NUEVO — Protección A (trigger + función SQL reutilizable)
├── src/
│   ├── db/
│   │   └── transaction.ts                     # NUEVO — helper mínimo BEGIN/COMMIT/ROLLBACK (research.md Decisión 3)
│   ├── routes/
│   │   └── organismos.ts                      # MODIFICADO — GET/PUT taxonomía reconstruidos; rama de Protección B en PATCH /:id
│   └── http/
│       └── trigger-error.ts                    # NUEVO — mapea SQLSTATE P0001 a un error de cliente identificable (research.md Decisión 4), usado SOLO por las rutas que esta feature toca
└── tests/
    ├── contract/
    │   └── taxonomia.test.ts                   # NUEVO — no existía (D11); cubre FR-015/FR-023
    └── integration/
        └── organismos-cambio-tipo.test.ts       # NUEVO — Protección B de punta a punta

db/validation/
└── taxonomia_tipo_organismo.sql                 # NUEVO — Protección A a nivel de esquema, mismo patrón que 003
```

**Structure Decision**: se extiende `backend/` (mismo proyecto de `002`/`003`, sin proyecto nuevo). `organismos.ts` se modifica en el lugar — no se crea un archivo de rutas separado para taxonomía, porque el archivo ya organiza sus rutas por sub-recurso del organismo padre (organismos / UF / taxonomía) con la misma función de autorización compartida; separarlo en un archivo nuevo solo por esta feature rompería esa cohesión sin necesidad real.

## Complexity Tracking

*Sin violaciones — tabla omitida.*
