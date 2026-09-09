---
description: "Task list for 001-modelo-datos-relacional"
---

# Tasks: Modelo de datos relacional y migración desde Firestore

**Input**: Design documents from `/specs/001-modelo-datos-relacional/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ (schema.sql, reconciliacion-log.schema.json), quickstart.md

**Tests**: No se pidió TDD ni tests unitarios de código. La verificación de esta feature es por **reconciliación** (conteo origen↔destino) y **validación del modelo/datos** (integridad, canonicalización, reglas de negocio), tal como definen el plan (FR-031/032, SC-002/003/010) y `quickstart.md`. Esas tareas de validación son entregables **requeridos** por los FR/SC, no tests opcionales, y están incluidas abajo.

**Organization**: Tareas agrupadas por historia de usuario. El modelo (esquema + semillas + framework de migración) es prerequisito bloqueante y vive en Foundational.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: puede correr en paralelo (archivos distintos, sin dependencias pendientes)
- **[Story]**: US1–US5 (mapea a las historias de `spec.md`)
- Rutas de proyecto según `plan.md`: `db/` (esquema + semillas + validación) y `migration/` (herramienta de un solo uso, Node.js 20 + firebase-admin + pg)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Estructura del proyecto y toolchain de la herramienta de migración.

- [ ] T001 Crear la estructura de directorios por `plan.md`: `db/schema.sql`, `db/seeds/`, `db/validation/`, `migration/src/{extract,transform,load,reconcile}/`, `migration/config/`
- [ ] T002 Inicializar la herramienta de migración Node.js 20 en `migration/package.json` con dependencias `firebase-admin` (lectura de origen) y `pg` (carga en destino)
- [ ] T003 [P] Implementar carga de credenciales desde variables de entorno / gestor de secretos en `migration/config/` — sin rutas hardcodeadas (Principio XIII)
- [ ] T004 [P] Configurar lint/format de la herramienta en `migration/` siguiendo las convenciones del toolchain existente (`scripts/*.cjs`)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: El modelo relacional (esquema + semillas de catálogos) y el framework de migración. Es el prerequisito bloqueante de todas las historias.

**⚠️ CRITICAL**: Ninguna historia de migración/validación puede completarse hasta terminar esta fase.

- [ ] T005 Materializar `db/schema.sql` desde `contracts/schema.sql` (DDL autoritativo): `estado_fueros_enum`; catálogos; `usuarios`/`usuario_roles`; `organismos`/`organismo_editores`/`organismo_fueros`; `localidades`; `grupos_jueces`; `unidades_funcionales`; `unidad_funcional_grupo_jueces`; `asignacion_fueros` + trigger `trg_asignacion_fuero_dentro_de_uf`; `evaluaciones_taxonomicas`; `vista_fuero_simplificado`; `migracion_reconciliacion`; índices
- [ ] T006 Aplicar `db/schema.sql` a una base PostgreSQL 17 limpia dentro de una transacción y verificar que existen tablas, vista, enum y trigger (`quickstart.md` Paso 1)
- [ ] T007 [P] Escribir las semillas de vocabularios controlados en `db/seeds/`: `provincias` (24), `tipos_oficina` (4), `denominaciones_simplificadas` (10), `tipos_uf` (3), `fueros` (4: penal/civil/familia/laboral), `roles` (2), `taxonomia_codigos` (etiquetas por dimensión)
- [ ] T008 Cargar las semillas y verificar los conteos de referencia (`quickstart.md` Paso 2: provincias=24, denominaciones=10, fueros=4)
- [ ] T009 [P] Implementar la conexión de lectura a Firestore (firebase-admin) por colección en `migration/src/extract/firestore-client.*`
- [ ] T010 [P] Implementar la conexión de carga a PostgreSQL (pg) y el resolvedor de FK `firestore_id → id subrogado` en `migration/src/load/pg-client.*`
- [ ] T011 Implementar el motor de reconciliación (conteo origen/destino por entidad, escritura en `migracion_reconciliacion`, `halt` en discrepancia) conforme a `contracts/reconciliacion-log.schema.json` en `migration/src/reconcile/reconcile.*` (depende de T010)

**Checkpoint**: Modelo aplicado + semillas cargadas + framework listo → las historias pueden comenzar.

---

## Phase 3: User Story 1 - Modelo fiel al dominio actual (Priority: P1) 🎯 MVP

**Goal**: El modelo relacional captura **todas** las entidades, atributos y relaciones del dominio Firestore, sin ambigüedades, incluida la relación UF↔jueces por asignaciones (D8).

**Independent Test**: cada colección/campo de la auditoría §2 tiene entidad/atributo o decisión de descarte (SC-001, 0 sin resolver); toda relación implícita es FK explícita; el modelo de asignaciones representa los 5 casos de D8 y los dos conteos (13/5/10 por UF, 20 agregado). Se valida sin migrar datos (inspección de esquema + fixtures sintéticos).

- [ ] T012 [P] [US1] Verificar y completar el mapeo de cobertura colección/campo → entidad del modelo (o decisión de descarte con razón) en `data-model.md` §"Cobertura", contra `docs/auditoria-app-actual.md` §2 — objetivo SC-001: 0 campos sin resolver
- [ ] T013 [US1] Validar en `db/validation/relaciones.sql` que toda relación implícita de Firestore es FK explícita en el esquema: UF→localidad, UF↔grupos vía `unidad_funcional_grupo_jueces`, organismo→propietario, organismo↔editores, organismo↔fueros, taxonomía 1:1 (PK sobre `organismo_id`)
- [ ] T014 [US1] Validar el modelo de asignaciones de jueces con fixtures sintéticos en `db/validation/conteo_jueces.sql`: reproducir el ejemplo D8 (UF1 = 5 exclusivos + pool A completo (5) + subconjunto de 3 de pool B (10, UF3 completo)) y comprobar **por UF** 13/5/10 (`SUM(cantidad_asignada)` sin deduplicar) y **agregado** 20 (`SUM(total_jueces)` de grupos referenciados, cada uno una vez), nunca 28
- [ ] T015 [US1] Validar en `db/validation/reglas_asignacion.sql` las reglas de FR-018: `cantidad_asignada > 0` (CHECK), `UNIQUE(unidad_funcional_id, grupo_jueces_id)`, y el trigger que rechaza un fuero de asignación fuera de `organismo_fueros` del organismo de la UF (`quickstart.md` intentos negativos)

**Checkpoint**: El modelo está aplicado y verificado como representación fiel y completa del dominio (MVP).

---

## Phase 4: User Story 2 - Migración con cero pérdida y reconciliación (Priority: P1)

**Goal**: Todos los registros de Firestore llegan al modelo con reconciliación por entidad y respaldo de solo-lectura.

**Independent Test**: corrida de migración con conteo origen=destino por cada entidad en el log de reconciliación, y Firestore accesible en solo-lectura como respaldo.

**Nota de orden de carga (runtime)**: el orquestador respeta las dependencias de FK: catálogos → `usuarios` (US4) → `localidades`, `grupos_jueces` → `organismos` → `unidades_funcionales` → asignaciones → `organismo_fueros` (US5), `organismo_editores` (US4), `evaluaciones_taxonomicas`. Cada módulo se implementa de forma independiente; la reconciliación de punta a punta requiere que estén todos.

- [ ] T016 [P] [US2] Extraer + cargar `localidades` (nombre, provincia, lat/long numéricas) en `migration/src/extract/localidades.*` y `migration/src/load/localidades.*`
- [ ] T017 [P] [US2] Extraer + cargar `grupos_jueces` desde `pools_jueces` (`total_jueces = cantidad_jueces`, `firestore_id` seteado) en `migration/src/extract/grupos-jueces.*` y `migration/src/load/grupos-jueces.*`
- [ ] T018 [US2] Extraer + transformar + cargar `organismos` (denominación, FK de catálogos, `legacy_id` nullable; canonicalizar el único `actualizado_a` string ISO — SC-010) en `migration/src/{extract,transform,load}/organismos.*`
- [ ] T019 [US2] Extraer + transformar + cargar `unidades_funcionales` (resolver `localidad_id`; extraer año de `anio_implementacion` por regla D7 — SC-010; vacíos legítimos → NULL) en `migration/src/{extract,transform,load}/unidades-funcionales.*`
- [ ] T020 [US2] Derivar + cargar asignaciones en `unidad_funcional_grupo_jueces` en `migration/src/{transform,load}/asignaciones-jueces.*`: UF con pool → una asignación al grupo del pool con `cantidad_asignada = total_jueces`; UF con `jueces_asistidos` → crear `grupos_jueces` exclusivo (`total_jueces = jueces_asistidos`, `firestore_id` NULL, provincia del organismo) + una asignación; UF sin ninguno → cero asignaciones. `asignacion_fueros` queda vacía
- [ ] T021 [P] [US2] Extraer + transformar + cargar `evaluaciones_taxonomicas` (aplanar `taxonomia/v1`; canonicalizar formas divergentes V4.3/V4.6/V4.7 si aparecen) en `migration/src/{extract,transform,load}/taxonomia.*`
- [ ] T022 [US2] Orquestar la migración completa en orden FK-seguro e invocar la reconciliación por entidad con `halt` en discrepancia (FR-030/031/032/034) en `migration/src/reconcile/orchestrator.*`
- [ ] T023 [US2] Verificar conteos origen=destino contra las cifras fechadas del 2026-09-07 (`quickstart.md` Paso 4; SC-002/008), incluida la nota D8: `grupos_jueces` con `firestore_id` = 30 pools; los exclusivos derivados y las 275 asignaciones reconcilian contra conteos derivados de las UF
- [ ] T024 [US2] Confirmar que Firestore queda accesible en modo solo-lectura como respaldo y que cada fila migrada conserva su `firestore_id` (FR-033, SC-009; `quickstart.md` Paso 6)

**Checkpoint**: Todos los datos migrados con evidencia de cero pérdida por entidad.

---

## Phase 5: User Story 3 - Integridad referencial sin datos huérfanos (Priority: P2)

**Goal**: Ninguna referencia apunta a un registro inexistente; una referencia rota es imposible por diseño.

**Independent Test**: recorrer todas las relaciones del modelo en destino → 0 referencias huérfanas (SC-003).

- [ ] T025 [US3] Validar 0 referencias huérfanas post-migración en `db/validation/integridad.sql` para todas las relaciones: UF→localidad, `unidad_funcional_grupo_jueces`→UF/grupo, `asignacion_fueros`→asignación/fuero, organismo→propietario/editores/fueros, taxonomía→organismo (`quickstart.md` Paso 5; SC-003)
- [ ] T026 [US3] Comprobar en `db/validation/integridad_rechazo.sql` que el esquema rechaza referencias rotas por diseño (intentos de insertar huérfanos → error de FK/trigger)

**Checkpoint**: Integridad referencial garantizada y verificada.

---

## Phase 6: User Story 4 - Identidad de usuario con id subrogado (Priority: P2)

**Goal**: Cada usuario se identifica por id subrogado; propiedad y edición por id; email único.

**Independent Test**: toda referencia de propiedad/edición resuelve a un id subrogado (no email); 0 usuarios con email duplicado (SC-004/005).

- [ ] T027 [P] [US4] Extraer + transformar + cargar `usuarios` (id subrogado; `email` a minúscula `citext`; atributos de perfil faltantes → NULL; `firestore_id` = email de origen) en `migration/src/{extract,transform,load}/usuarios.*`
- [ ] T028 [US4] Cargar `usuario_roles` desde el array `rol` (todos `usuario_normal`; los admin además `admin`) en `migration/src/load/usuario-roles.*`
- [ ] T029 [US4] Resolver identidad en `migration/src/transform/identity.*`: `organismos.propietario_id` desde `usuario_google` (email → id) y `organismo_editores` desde `editores[]` (email → id, sin duplicados, case-insensitive)
- [ ] T030 [US4] Validar identidad en `db/validation/identidad.sql`: 100% de propiedad/edición por id subrogado, 0 referencias por email, 0 emails duplicados (SC-004/005; `quickstart.md` Paso 5)

**Checkpoint**: Identidad unificada por id subrogado, verificada.

---

## Phase 7: User Story 5 - Fueros como relación múltiple y `fuero_simplificado` calculado (Priority: P3)

**Goal**: Fueros como relación N:M; `estado_fueros` preserva el estado conocido; `fuero_simplificado` derivado por vista.

**Independent Test**: la vista deriva `fuero_simplificado`; distribución de estados = 96 `cargado` con 1 fuero, 20 `multifuero_sin_detalle`, 0 `sin_fueros_asignados` (SC-006).

- [ ] T031 [US5] Cargar `organismo_fueros` (fueros concretos conocidos) y setear `organismos.estado_fueros` (`cargado` / `multifuero_sin_detalle` / `sin_fueros_asignados`) desde `fuero_simplificado` en `migration/src/{transform,load}/fueros.*`
- [ ] T032 [US5] Validar en `db/validation/fueros.sql` la derivación de `vista_fuero_simplificado` y la distribución de `estado_fueros` (SC-006: 96/20/0; `multifuero` cuando >1 fuero o `multifuero_sin_detalle`)

**Checkpoint**: Fueros modelados como relación y `fuero_simplificado` disponible por vista para reporting.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Cierre y validación de punta a punta.

- [ ] T033 [P] Redactar el runbook de migración (cómo correr, variables de entorno, comportamiento de `halt`/reanudación, respaldo) en `migration/README.md`
- [ ] T034 Ejecutar la validación completa de `quickstart.md` de punta a punta (crear esquema → semillas → migrar → reconciliar → integridad) y registrar resultados
- [ ] T035 [P] Verificar la paridad entre `db/schema.sql` y `contracts/schema.sql` (el DDL aplicado coincide con el contrato autoritativo)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Fase 1)**: sin dependencias.
- **Foundational (Fase 2)**: depende de Setup. **Bloquea** todas las historias. (T005→T006; T007 en paralelo; T008 depende de T006+T007; T009/T010 en paralelo; T011 depende de T010.)
- **US1 (Fase 3)**: depende de Foundational (esquema aplicado + semillas). No requiere datos migrados.
- **US2 (Fase 4)**: depende de Foundational. Es el backbone de la migración.
- **US3 / US4 / US5 (Fases 5–7)**: dependen de Foundational; sus **validaciones** corren tras una migración (US2 + los módulos de entidad propios de cada historia).
- **Polish (Fase 8)**: depende de que las historias deseadas estén completas.

### Cross-story runtime dependency (migración de punta a punta)

La migración es un pipeline ordenado por FK. Orden de carga en el orquestador (T022):
`catálogos (T008)` → `usuarios (T027, US4)` → `localidades (T016)`, `grupos_jueces (T017)` → `organismos (T018)` → `unidades_funcionales (T019)` → `asignaciones (T020)` → `organismo_fueros (T031, US5)`, `organismo_editores (T029, US4)`, `evaluaciones_taxonomicas (T021)`.

Cada módulo se **implementa** de forma independiente (archivos distintos por entidad); una **corrida completa** requiere los módulos de US2 + US4 + US5 (por eso US2 P1 se apoya en `usuarios` de US4 en runtime). La reconciliación por entidad (US2) permite validar cada entidad de forma independiente en el orden de carga.

### Within each story

- Extraer → transformar → cargar → reconciliar/validar.
- Las validaciones (`db/validation/*.sql`) corren después de cargar la(s) entidad(es) que verifican.

### Parallel Opportunities

- Setup: T003, T004 en paralelo.
- Foundational: T007 en paralelo con T005/T006; T009 y T010 en paralelo.
- US1: T012 en paralelo (documento) con T013–T015 (archivos SQL distintos).
- US2: T016, T017, T021 en paralelo (entidades sin dependencia mutua); T018→T019→T020 secuenciales por FK; T022–T024 tras las cargas.
- US4: T027 en paralelo con otras entidades; T028/T029 tras `usuarios`.
- Polish: T033 y T035 en paralelo.

---

## Parallel Example: User Story 2

```bash
# Entidades sin dependencia mutua de FK (distintos módulos), en paralelo:
Task: "T016 [US2] Extraer + cargar localidades en migration/src/{extract,load}/localidades.*"
Task: "T017 [US2] Extraer + cargar grupos_jueces desde pools_jueces en migration/src/{extract,load}/grupos-jueces.*"
Task: "T021 [US2] Extraer + cargar evaluaciones_taxonomicas en migration/src/{extract,transform,load}/taxonomia.*"
```

---

## Implementation Strategy

### MVP First (US1)

1. Fase 1: Setup.
2. Fase 2: Foundational (esquema aplicado + semillas + framework) — CRÍTICO.
3. Fase 3: US1 — validar que el modelo representa fielmente el dominio (cobertura, relaciones, modelo de asignaciones + conteos D8).
4. **PARAR y VALIDAR**: el modelo está completo y correcto antes de migrar. Demo del esquema.

### Incremental Delivery

1. Setup + Foundational → modelo listo.
2. + US1 → modelo validado (MVP).
3. + US2 → datos migrados con reconciliación (demo de cero pérdida).
4. + US3 → integridad referencial verificada.
5. + US4 → identidad por id subrogado verificada.
6. + US5 → fueros y `fuero_simplificado` por vista.
7. Polish → runbook + quickstart end-to-end.

---

## Notes

- **[P]** = archivos distintos, sin dependencias pendientes.
- La etiqueta **[Story]** mapea cada tarea a su historia para trazabilidad.
- Esta feature es **modelo de datos + herramienta de migración de un solo uso**; no toca la SPA actual (`src/`), que sigue operativa contra Firestore durante toda la migración (Principio IX).
- La verificación es por reconciliación y validación SQL (no TDD); las tareas de validación son entregables requeridos por FR/SC.
- `contracts/schema.sql` es el contrato autoritativo; `db/schema.sql` es su copia aplicable (T005/T035).
- Commit por tarea o grupo lógico; parar en cualquier checkpoint para validar una historia de forma independiente.
