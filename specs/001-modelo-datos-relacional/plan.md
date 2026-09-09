# Implementation Plan: Modelo de datos relacional y migración desde Firestore

**Branch**: `001-modelo-datos-relacional` | **Date**: 2026-09-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-modelo-datos-relacional/spec.md`

## Summary

Esta feature define el **esquema relacional PostgreSQL** que reemplaza el
almacenamiento en Cloud Firestore, y la **migración de una sola vez** que traslada
los datos existentes (46 usuarios, 116 organismos, 277 UF, 129 localidades, 30
pools) al modelo nuevo con reconciliación por conteo y cero pérdida.

Enfoque técnico (decidido en este plan, a partir del input del usuario y de los
resultados de verificación fechados del 2026-09-07):

- **Motor**: PostgreSQL self-hosted en datacenter propio, sin restricciones de
  recursos. No aplica ningún perfil de hardware acotado.
- **Claves subrogadas**: enteras (`bigint GENERATED ALWAYS AS IDENTITY`, el
  equivalente moderno de `bigserial`) para `organismos`, `localidades`,
  `grupos_jueces`, `usuarios`, `unidades_funcionales` y
  `unidad_funcional_grupo_jueces`. **No UUID**: no hay generación distribuida ni
  requisito de ocultar secuencialidad.
- **Nombres**: `snake_case` en tablas y columnas.
- **Identidad de usuario**: `id` subrogado como PK; `email` como columna `unique`
  case-insensitive (tipo `citext`), **no** como clave primaria (Principio V, D4).
- **Integridad referencial**: toda referencia hoy suelta se declara como FK
  (Principio VIII).
- **Vocabularios controlados**: tablas de referencia con FK para los catálogos de
  dominio; `CHECK` para los códigos de taxonomía; `enum` nativo para los
  discriminadores internos del modelo.
- **Migración**: herramienta de un solo uso (Node.js + firebase-admin + `pg`) que
  reutiliza el toolchain ya verificado, con log de reconciliación por entidad y
  Firestore preservado en solo-lectura como respaldo.

**Fuera de alcance de esta feature** (confirmado por el input del usuario): stack
de backend de aplicación y stack de frontend. El único software que este plan
define es la **herramienta de migración**, que no es el backend de la app.

## Technical Context

**Language/Version**: N/A para el modelo (es DDL SQL). Herramienta de migración:
Node.js 20 LTS (reutiliza el toolchain existente de `scripts/*.cjs`).

**Primary Dependencies**: PostgreSQL 17 (self-hosted; 16+ aceptable), extensión
`citext`. Migración: `firebase-admin` (lectura del origen, ya en uso) + `pg`
(node-postgres, carga en destino).

**Storage**: PostgreSQL 17 self-hosted (destino). Cloud Firestore (origen, queda
en modo solo-lectura como respaldo hasta el cierre del proyecto — FR-033).

**Testing**: Reconciliación por conteo origen↔destino por entidad (FR-031/032);
verificación de integridad referencial impuesta por las FK del propio esquema
(0 huérfanos posibles por diseño — SC-003); verificación de reglas de
canonicalización (`actualizado_a`, `anio_implementacion` — SC-010).

**Target Platform**: Servidor Linux en datacenter propio (self-hosted).

**Project Type**: Modelo de datos + herramienta de migración (single project).

**Performance Goals**: N/A. El dataset completo son ~600 filas entre todas las
entidades; no hay objetivos de throughput ni latencia. La migración es batch,
de un solo uso.

**Constraints**: Cero pérdida de datos verificada por reconciliación (Principio X);
app actual operativa durante toda la migración (Principio IX); Firestore en
solo-lectura como respaldo; sin dependencia funcional de GCP en la ruta crítica
del modelo (Principio I); secretos fuera del árbol del repo (Principio XIII).

**Scale/Scope**: 46 usuarios, 116 organismos, 277 unidades funcionales, 129
localidades, 30 pools de jueces, 89 evaluaciones taxonómicas. Catálogos: 24
provincias, 10 denominaciones simplificadas, 4 tipos de oficina, 3 tipos de UF,
4 fueros, 2 roles.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio | Aplicabilidad a esta feature | Estado |
|---|---|---|
| **I. Soberanía de datos** | El modelo vive en PostgreSQL self-hosted; Firestore queda solo como respaldo de lectura, fuera de la ruta crítica. | ✅ Cumple |
| **II. Autorización en el servidor** | Fuera de alcance (backend). El modelo guarda rol y propiedad que la autorización futura necesitará, sin implementar enforcement. | ✅ N/A justificado |
| **III. Autenticación plural** | Fuera de alcance (backend/auth). El modelo lo habilita: id subrogado + email único (V, D4). | ✅ N/A justificado |
| **IV. Credenciales seguras** | Fuera de alcance (backend/auth). El modelo no almacena contraseñas todavía. | ✅ N/A justificado |
| **V. Identidad unificada** | `usuarios.id` subrogado (PK) + `email citext UNIQUE`, no email como PK. Propiedad y edición por FK a `id`. | ✅ Cumple (FR-004/005/009/010) |
| **VI. Autorización desde la fuente** | Fuera de alcance (reglas de seguridad). El modelo persiste `rol` y ownership; el enforcement es del backend. | ✅ N/A justificado |
| **VII. Esquema sobre datos verificados** | Todos los tipos, nulidad y FK se deciden a partir de la corrida fechada 2026-09-07, no de supuestos del código. | ✅ Cumple |
| **VIII. Integridad referencial explícita** | FK para UF→localidad, UF→pool, organismo→propietario, organismo↔editores, organismo↔fueros; catálogos por FK. | ✅ Cumple (FR-025) |
| **IX. Migración por partes** | Migración descomponible y verificable por entidad; Firestore en solo-lectura; app actual operativa. | ✅ Cumple (FR-034) |
| **X. Cero pérdida, reconciliación** | Tabla y log `migracion_reconciliacion` con conteo origen/destino por entidad; halt en discrepancia. | ✅ Cumple (FR-031/032) |
| **XI. Código muerto no se migra** | `importarTaxonomiaDesdeCSV`, `Layout`, componentes UI sin uso: no se modelan. Taxonomía se modela por catálogo canónico. | ✅ Cumple |
| **XII. Trazabilidad de decisiones** | Cada decisión de tipo/estrategia queda en `research.md` con contexto, alternativa y razón. | ✅ Cumple |
| **XIII. Secretos fuera del árbol** | La herramienta de migración carga credenciales de variables de entorno / gestor de secretos; **no** hardcodea rutas (a diferencia de `importar_denominaciones.cjs:5`). | ✅ Cumple |

**Resultado del gate (pre-Phase 0)**: PASA. No hay violaciones. Complexity
Tracking queda vacío.

**Re-check (post-Phase 1)**: PASA sin cambios. El diseño no introduce
dependencias de GCP, mantiene la reconciliación como artefacto de primera clase
y no agrega complejidad injustificada. Ver [data-model.md](./data-model.md) y
[contracts/schema.sql](./contracts/schema.sql).

## Project Structure

### Documentation (this feature)

```text
specs/001-modelo-datos-relacional/
├── plan.md              # Este archivo (/speckit-plan)
├── research.md          # Fase 0: decisiones técnicas resueltas
├── data-model.md        # Fase 1: entidades, atributos, relaciones, reglas
├── quickstart.md        # Fase 1: guía de validación (crear esquema + migrar + reconciliar)
├── contracts/           # Fase 1: contratos del modelo
│   ├── schema.sql       #   DDL PostgreSQL autoritativo (el contrato del modelo)
│   └── reconciliacion-log.schema.json  # Formato del log de reconciliación
└── tasks.md             # Fase 2 (/speckit-tasks — NO lo crea /speckit-plan)
```

### Source Code (repository root)

Esta feature no toca el código de la SPA actual (`src/`), que sigue operativa
contra Firestore durante toda la migración (Principio IX). Los artefactos nuevos
son el esquema y la herramienta de migración:

```text
db/
├── schema.sql                 # DDL del modelo relacional (copia autoritativa desde contracts/)
└── seeds/                     # Datos de los vocabularios controlados (provincias, fueros, etc.)

migration/
├── src/
│   ├── extract/               # Lectura de Firestore (firebase-admin) por colección
│   ├── transform/             # Canonicalización (actualizado_a, anio_implementacion, editores)
│   ├── load/                  # Carga en PostgreSQL (pg), resolución de FK por firestore_id
│   └── reconcile/             # Conteo origen↔destino, log de reconciliación, halt en discrepancia
└── config/                    # Carga de credenciales desde env/gestor de secretos (Principio XIII)
```

**Structure Decision**: Proyecto único orientado a datos. `db/` contiene el
esquema y las semillas de catálogos; `migration/` contiene la herramienta de un
solo uso. Las rutas concretas se materializan en `/speckit-tasks`; acá quedan
declaradas para ubicar los artefactos. El backend y el frontend de aplicación
son features posteriores y no aparecen en este árbol.

## Complexity Tracking

> No aplica. La verificación de constitución no arrojó violaciones; no hay
> desviaciones que justificar.
