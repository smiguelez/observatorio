# Implementation Plan: Taxonomía de organismos parametrizable por preguntas

**Branch**: `003-taxonomia-parametrizable` | **Date**: 2026-09-22 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-taxonomia-parametrizable/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Reformula `evaluaciones_taxonomicas` (9 columnas fijas + `CHECK` contra
`taxonomia_codigos`) a un modelo parametrizado por preguntas
(`taxonomia_preguntas`, `taxonomia_opciones`, `evaluaciones_taxonomicas`
reformulada como tabla de respuestas), dentro del mismo esquema `public` ya
migrado en `001-modelo-datos-relacional`. A diferencia de esa feature (cuyo
origen era Firestore, migrado con un script de un solo uso), acá el origen
ya es Postgres: es una migración de esquema versionada (ALTER/CREATE/data
transform dentro de una transacción), ejecutada con un migrador de archivos
que se agrega al backend (`002-backend-api-carga-datos`) — el primero que
tiene este proyecto para `public.*`, ya que hasta ahora ese esquema se
aplicó una sola vez a mano con `db/schema.sql`. Reconciliación con el mismo
mecanismo y la misma tabla (`migracion_reconciliacion`) que
`001-modelo-datos-relacional` (Principio X): 801 respuestas esperadas
(89 evaluaciones × 9 columnas) contra las filas reales insertadas en la
tabla de respuestas nueva.

## Technical Context

**Language/Version**: Node.js 20 LTS + TypeScript — mismo runtime que
`002-backend-api-carga-datos`, sin cambios ni research adicional (decisión
del usuario).

**Primary Dependencies**: `kysely` (Fase 0 — ya es dependencia directa del
backend vía el adaptador de Better Auth; se reutiliza también su
`Migrator`/`FileMigrationProvider` para `public.*`, ver Decisión 1 de
research.md) + `pg` (mismo pool/patrón de conexión que ya usa
`backend/src/db/pool.ts`).

**Storage**: PostgreSQL 17, misma base que `001-modelo-datos-relacional` y
`002-backend-api-carga-datos` (`DATABASE_URL`, Principio XIII). Un solo
esquema tocado: `public` — específicamente `taxonomia_preguntas` (nueva),
`taxonomia_opciones` (nueva), `taxonomia_pregunta_tipos_oficina` (nueva,
bridge de integridad para el campo informativo "aplica a tipos de
organismo" — Principio VIII), y `evaluaciones_taxonomicas` (reformulada).
`auth.*`, `organismos`, `usuarios`, `pools_jueces` (`grupos_jueces`), y el
resto de `public.*` — sin cambios (instrucción explícita del usuario).

**Testing**: Vitest, mismo patrón que `002-backend-api-carga-datos`
(`backend/tests/`) — contra la base real, no mocks. Se agrega una
verificación de migración (aplicar + reconciliar) como parte de
`db/validation/` (mismo patrón que `001-modelo-datos-relacional`) para la
parte de datos, y un test de integración en `backend/tests/` para las
restricciones de integridad (FR-007/FR-008) que sí son código de
aplicación además de constraints de base.

**Target Platform**: Linux server, mismo host que ya corre Postgres y el
backend (`002-backend-api-carga-datos`) — sin infraestructura nueva.

**Project Type**: migración de esquema (dato + DDL), dentro del proyecto
backend ya existente — no es un servicio nuevo ni una herramienta de un
solo uso como `migration/` (`001-modelo-datos-relacional`).

**Performance Goals**: sin objetivo de escala especificado — 89 filas de
origen, 801 filas de destino esperadas; no hay SC de throughput.

**Constraints**: la migración MUST correr dentro de una transacción (Postgres
soporta DDL transaccional) y MUST detenerse (rollback) ante cualquier
discrepancia de reconciliación — igual que el orquestador de
`001-modelo-datos-relacional` (Principio X, "corrió sin error" no alcanza).

**Scale/Scope**: 9 preguntas, 32 opciones, 89 organismos con evaluación
(801 respuestas esperadas), sobre 117 organismos totales.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio | Aplica | Evaluación (pre-research) |
|---|---|---|
| I. Soberanía de datos sobre GCP | No | Sin cambios — sigue Postgres self-hosted. **N/A**. |
| II. Autorización en el servidor | No directamente | Esta feature es modelo de datos, no expone endpoints nuevos (el backend que consuma la taxonomía nueva es una feature de backend aparte, fuera de este alcance según spec.md). **N/A** para esta feature puntual — a verificar que no se cuele ninguna ruta nueva en Fase 1. |
| VII. Esquema sobre datos verificados | Sí | `spec.md` ya se construyó verificando contra datos reales (conteo real de `taxonomia_codigos`, cruce `tipo_oficina` × `evaluaciones_taxonomicas`, lectura de `TaxonomiaForm.jsx` para el texto de pregunta) — no sobre supuestos. **PASS**, heredado de la spec. |
| VIII. Integridad referencial explícita | Sí | Gate central de esta feature: FR-007 (una respuesta no puede referir la opción de otra pregunta) y FR-004 (una pregunta no categórica no puede tener opciones) deben quedar garantizados por diseño (FK/constraint), no por convención de aplicación. **PENDIENTE de research/data-model** — se resuelve en Fase 1. |
| X. Cero pérdida, reconciliación | Sí | Gate central: 801 respuestas esperadas, mismo mecanismo que `001-modelo-datos-relacional` (`migracion_reconciliacion`), halt ante discrepancia. **PENDIENTE de research** (Decisión 1: mecanismo de migración que permita este halt transaccional). |
| XII. Trazabilidad de decisiones | Sí | research.md debe documentar por qué se elige un migrador de esquema para `public.*` (primero que tiene el proyecto) con alternativas consideradas. **Aplicado en este plan**. |
| XIII. Secretos fuera del árbol | Sí | Reutiliza `DATABASE_URL` ya cargado por `backend/src/config/env.ts` — sin credenciales nuevas. **PASS**. |

**Resultado**: sin violaciones bloqueantes; dos gates quedan pendientes de
Fase 0 (mecanismo de migración versionada para `public.*`, Principio X) y
uno de Fase 1 (garantía de integridad por diseño para FR-007/FR-004,
Principio VIII).

### Re-chequeo post Fase 0 (research.md)

| Principio | Estado tras research.md |
|---|---|
| VIII. Integridad referencial explícita | **PASS en diseño** — Decisión 2 (research.md) define `taxonomia_opciones.pregunta_id` FK obligatoria y una restricción de que `evaluaciones_taxonomicas.opcion_id` (cuando no es NULL) debe resolver a una opción de la MISMA pregunta que la fila de respuesta — mecanismo concreto en data-model.md. |
| X. Cero pérdida, reconciliación | **PASS** — Decisión 1 (Kysely `Migrator`, ya dependencia del backend) permite migraciones dentro de una transacción Postgres real; Decisión 3 define el halt (reconciliación contra `migracion_reconciliacion`, mismo criterio que 001, con `RAISE EXCEPTION` si no coincide, que aborta la transacción completa de la migración). |

### Re-chequeo post Fase 1 (data-model.md, contracts/, quickstart.md)

| Principio | Estado tras Fase 1 | Evidencia puntual |
|---|---|---|
| VIII. Integridad referencial explícita | **PASS** | `data-model.md` / `contracts/migration-0001-taxonomia.sql`: `UNIQUE(pregunta_id, codigo)` en `taxonomia_opciones`; `CHECK` + trigger en `evaluaciones_taxonomicas` que valida que `opcion_id` (si no es NULL) pertenece a `pregunta_id` de la misma fila — mismo patrón de trigger que `trg_asignacion_fuero_dentro_de_uf` de `001-modelo-datos-relacional`, no una regla nueva inventada. |
| X. Cero pérdida, reconciliación | **PASS** | `contracts/migration-0001-taxonomia.sql` inserta en `migracion_reconciliacion` con `entidad='evaluaciones_taxonomicas_respuestas'`, `conteo_origen=801` (calculado con un `SELECT count(*)` real sobre las 9 columnas no nulas de la tabla vieja, no hardcodeado), `conteo_destino` = filas insertadas; si difieren, `RAISE EXCEPTION` aborta toda la migración (transaccional). `quickstart.md` documenta cómo verificarlo. |
| II. Autorización en el servidor | **PASS, confirmado** | Ningún archivo de `contracts/` ni `data-model.md` define una ruta HTTP — se mantiene 100% modelo de datos, tal como delimitó `spec.md`. |

**Resultado**: sin violaciones. Lista para `/speckit-tasks`.

## Project Structure

### Documentation (this feature)

```text
specs/003-taxonomia-parametrizable/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output — DDL de la migración (contrato autoritativo)
└── tasks.md             # Phase 2 output (/speckit-tasks — no lo crea este comando)
```

### Source Code (repository root)

Todo el código nuevo vive dentro de `backend/` (el proyecto ya existente de
`002-backend-api-carga-datos`) — no hay proyecto ni servicio nuevo. `db/` y
`migration/` (de `001-modelo-datos-relacional`) no se tocan: esa migración
ya se cerró; esta es una migración de esquema posterior, versionada, que
vive junto al backend que la va a consumir eventualmente.

```text
backend/
├── migrations/                        # NUEVO — carpeta de migraciones de
│   │                                   # public.* (Kysely FileMigrationProvider,
│   │                                   # research.md Decisión 1)
│   └── 0001_taxonomia_parametrizable.ts
├── scripts/
│   └── migrate-public.ts              # NUEVO — corredor de migraciones de
│                                       # public.* (análogo a migrate-auth.ts,
│                                       # pero para public.*, no auth.*)
├── src/
│   └── db/
│       └── kysely.ts                  # NUEVO — instancia Kysely<PublicDB> para
│                                       # public.* (separada de la que usa
│                                       # Better Auth para auth.*)
db/
└── validation/
    └── taxonomia_reconciliacion.sql   # NUEVO — validación post-migración
                                        # (mismo patrón que
                                        # 001-modelo-datos-relacional)
```

**Structure Decision**: la migración vive en `backend/migrations/` (código,
versionado con git, ejecutado por el mismo backend que ya existe) en vez de
en `db/` (que en `001-modelo-datos-relacional` es el contrato DDL aplicado
una sola vez a mano). `db/validation/` sí se reutiliza para la verificación
SQL post-migración, mismo patrón que la feature anterior.

## Complexity Tracking

*Sin violaciones del Constitution Check que requieran justificación — la
tabla queda vacía a propósito.*
