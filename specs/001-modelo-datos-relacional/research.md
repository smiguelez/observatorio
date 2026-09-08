# Research: decisiones técnicas del modelo relacional

**Feature**: 001-modelo-datos-relacional | **Fecha**: 2026-09-07

Este documento resuelve las decisiones técnicas que la spec difirió
explícitamente a `/speckit-plan` (motor, tipos de columna, claves, índices,
materialización de valores derivados, estrategia de vocabularios y de
migración). Cada decisión cita la evidencia fechada del 2026-09-07 cuando
corresponde (Principio VII) y registra la alternativa descartada (Principio XII).

No quedaron `NEEDS CLARIFICATION`: el input del usuario fijó motor, tipo de
clave, convención de nombres y tratamiento del email; el resto se deriva de la
spec y de los resultados de verificación.

---

## D-01 — Motor de base de datos

- **Decisión**: PostgreSQL 17 self-hosted (16+ aceptable), en servidor propio de
  datacenter, sin restricciones de recursos.
- **Rationale**: input del usuario y Principio I (soberanía de datos: sin
  dependencia funcional de GCP). No aplica ningún perfil de hardware acotado de
  versiones anteriores del proyecto. El volumen (~600 filas totales) es trivial
  para cualquier versión moderna.
- **Alternativas descartadas**: servicios gestionados de GCP (Cloud SQL) —
  reintroducen dependencia de GCP en la ruta crítica, prohibido por Principio I.

## D-02 — Tipo de clave primaria subrogada

- **Decisión**: claves subrogadas enteras con `bigint GENERATED ALWAYS AS
  IDENTITY` para `usuarios`, `organismos`, `localidades`, `pools_jueces` y
  `unidades_funcionales`. **No UUID.**
- **Rationale**: input del usuario. No hay generación distribuida de ids ni
  necesidad de ocultar secuencialidad, que son las dos razones que justificarían
  UUID. `GENERATED ALWAYS AS IDENTITY` es el equivalente moderno y
  estándar-SQL de `bigserial` (misma secuencia subyacente, mejor semántica: no
  se puede insertar un id manual por accidente). `bigint` sobre `integer` no
  cuesta nada en un servidor sin restricciones y evita cualquier techo futuro.
- **Nota de desviación (Principio XII)**: el input pedía `bigserial/integer`; se
  usa `GENERATED ALWAYS AS IDENTITY`, que cumple la intención ("subrogado
  entero, no UUID") con la forma idiomática actual de PostgreSQL. Las tablas de
  unión (`organismo_editores`, `organismo_fueros`, `usuario_roles`) usan clave
  primaria compuesta por sus FK, sin id subrogado propio.
- **Alternativas descartadas**: (a) UUID — sin caso de uso, agrega tamaño e
  ilegibilidad; (b) `bigserial` literal — funciona, pero `IDENTITY` es la forma
  recomendada desde PostgreSQL 10; (c) conservar el doc-id de Firestore como PK
  — son strings opacos; se conservan como columna de trazabilidad
  (`firestore_id`), no como clave.

## D-03 — Convención de nombres

- **Decisión**: `snake_case` en todas las tablas y columnas; nombres de tabla en
  plural (`organismos`, `usuarios`), tablas de unión con las dos entidades
  (`organismo_editores`, `organismo_fueros`, `usuario_roles`).
- **Rationale**: input del usuario; convención idiomática de PostgreSQL (evita
  comillas por identificadores en mayúscula).
- **Alternativas descartadas**: `camelCase` (como los campos de Firestore) —
  obligaría a comillar identificadores en SQL.

## D-04 — Identidad de usuario: id subrogado + email único case-insensitive

- **Decisión**: `usuarios.id` (subrogado) es la PK. El email se modela como
  columna `email citext NOT NULL UNIQUE`. La migración normaliza a minúscula al
  cargar (defensa en profundidad, aunque V1.1 ya reporta 46/46 en minúscula).
- **Rationale**: D4 y Principio V. El email como clave primaria es frágil cuando
  coexisten varios métodos de login. `citext` hace que la unicidad sea
  case-insensitive **por construcción del tipo**: ninguna consulta futura de
  autenticación puede "olvidarse" de hacer `lower(email)` y abrir una vía de
  colisión/apropiación de cuenta — que es exactamente el riesgo que el Principio
  V busca cerrar. V1.1 (2026-09-07) confirma 0 colisiones por casing, así que la
  restricción no exige fusionar registros: se impone hacia adelante.
- **Alternativas descartadas**: índice único sobre `lower(email)` con columna
  `text` — es la otra opción que ofrecía el input. Funciona, pero delega la
  case-insensitivity a cada autor de consulta; `citext` la centraliza en el
  esquema. El costo (instalar la extensión `citext`, en `contrib`) es nulo en un
  servidor self-hosted sin restricciones.

## D-05 — Estrategia de vocabularios controlados

- **Decisión**: tres tratamientos según la naturaleza del vocabulario:
  1. **Tablas de referencia con FK** para los catálogos de dominio que pueden
     crecer, se comparten entre entidades o necesitan etiquetas: `provincias`,
     `tipos_oficina`, `denominaciones_simplificadas`, `tipos_uf`, `fueros`,
     `roles`.
  2. **`CHECK` por columna** para los 9 códigos de taxonomía (valores fijos por
     la metodología del instrumento), más una tabla `taxonomia_codigos`
     (dimensión, código, etiqueta) para las etiquetas de reporting.
  3. **`enum` nativo** para los discriminadores internos del modelo que son
     fijos y no son catálogos de usuario: `modo_jueces`, `estado_fueros`.
- **Rationale**:
  - Los catálogos de dominio **evolucionan** (denominación bajó de 39 a 10; los
    fueros se ampliarán con la carga de referentes) y sirven para joins de
    reporting con etiquetas legibles: una tabla de referencia se amplía con un
    `INSERT`, sin `ALTER TYPE` ni migración de esquema, e integra con la
    integridad referencial (Principio VIII).
  - Los 9 códigos de taxonomía tienen **catálogos distintos por dimensión**
    (p. ej. `alcance_fuero` usa A/B/C/E; `presencia_territorial` usa A/B/C/D;
    `grado_implementacion` usa A/B). Un FK compuesto por columna exigiría una
    columna-dimensión redundante por código; el `CHECK` por columna expresa el
    catálogo exacto de cada dimensión sin esa redundancia, y `taxonomia_codigos`
    provee las etiquetas para reporting.
  - `modo_jueces` y `estado_fueros` son máquinas de estado internas, no
    catálogos administrables: `enum` nativo las documenta y restringe sin una
    tabla extra.
- **Alternativas descartadas**: (a) `enum` nativo para todos los catálogos de
  dominio — rígido; ampliar fueros/provincias requeriría `ALTER TYPE` y no
  admite etiquetas; (b) FK compuesto para los 9 códigos de taxonomía — exige
  columnas-dimensión redundantes; (c) texto libre validado en aplicación —
  viola Principio VIII (la integridad debe vivir en el esquema).

## D-06 — Materialización de `fuero_simplificado` (D3)

- **Decisión**: **vista** (`vista_fuero_simplificado`), no columna almacenada.
  El modelo guarda: (a) la relación concreta `organismo_fueros` (N:M), y (b) un
  discriminador `organismos.estado_fueros` (`enum`: `cargado`,
  `multifuero_sin_detalle`, `sin_fueros_asignados`) para los casos en que los
  fueros concretos no se conocen. La vista deriva:
  - `estado_fueros = 'cargado'`: `'multifuero'` si hay >1 fuero, o el fuero único
    si hay exactamente 1.
  - `estado_fueros = 'multifuero_sin_detalle'`: `'multifuero'`.
  - `estado_fueros = 'sin_fueros_asignados'`: `NULL` (sin asignar).
- **Rationale**: `fuero_simplificado` es "derivable del listado" (FR-012), pero
  los dos estados de migración (`multifuero_sin_detalle`, `sin_fueros_asignados`)
  **no** son derivables de la relación: codifican "sabemos que es multifuero
  pero no cuáles" y "sin fuero conocido". Por eso hacen falta la relación N:M
  **y** el discriminador. Una **columna generada** de PostgreSQL no sirve: debe
  ser inmutable y basarse en la misma fila, no puede agregar desde una tabla
  hija. Una vista siempre está correcta sin lógica de trigger y la consume el
  reporting sin cambios (resuelve el impacto en Data Studio que D3 señala). Al
  ser ~116 filas, calcular en lectura es gratis.
- **Estado de los datos (2026-09-07)**: 96 organismos con exactamente 1 fuero
  (penal 41, civil 31, laboral 13, familia 11) → `estado_fueros='cargado'` con 1
  fila en `organismo_fueros`; 20 organismos `multifuero` →
  `estado_fueros='multifuero_sin_detalle'` con `organismo_fueros` vacío; 0
  organismos en `sin_fueros_asignados`.
- **Alternativas descartadas**: (a) columna generada — imposible por agregación
  cross-table; (b) columna materializada con trigger — agrega complejidad en la
  ruta de escritura para un valor barato de calcular a esta escala; (c) cálculo
  en backend — el backend está fuera de alcance y dejaría el valor no disponible
  para reporting directo.

## D-07 — Tercer estado de jueces en UF (D6)

- **Decisión**: discriminador explícito `unidades_funcionales.modo_jueces`
  (`enum`: `cantidad_directa`, `pool`, `no_aplica`) + `jueces_asistidos integer
  NULL` + `pool_jueces_id bigint NULL REFERENCES pools_jueces`, con `CHECK` de
  exclusividad:
  - `cantidad_directa` → `jueces_asistidos IS NOT NULL AND pool_jueces_id IS NULL`
  - `pool` → `pool_jueces_id IS NOT NULL AND jueces_asistidos IS NULL`
  - `no_aplica` → ambos `NULL`
- **Rationale**: D6 pide un tercer estado explícito. Inferir el estado por el
  patrón de nulls es frágil (la auditoría documenta esa fragilidad): con dos
  columnas nullable, `(NULL, NULL)` no distingue "no aplica por diseño" de "dato
  faltante". El discriminador lo hace inequívoco (FR-018). V3.3 (2026-09-07)
  confirma 0 UF con ambos poblados y exactamente 2 UF con ninguno (las UF de
  "Secretaria de gestión administrativa" y "Oficina de Gestión Digital") →
  `no_aplica`. Regla de asignación en migración: pool presente → `pool`; si no,
  `jueces_asistidos` numérico → `cantidad_directa`; si ambos vacíos →
  `no_aplica` (rinde exactamente esas 2 UF).
- **Alternativas descartadas**: (a) inferir por nulls sin discriminador — no
  distingue `no_aplica` de faltante (viola D6/FR-018); (b) tabla separada de
  "asignación de jueces" — sobreingeniería para una relación 1:1 con la UF.

## D-08 — `anio_implementacion` (D7)

- **Decisión**: una sola columna `anio_implementacion smallint NULL`. La
  migración extrae el año según la regla de D7 (fecha reconocible → su año;
  `"2015. Refuncionalización 2024"` → 2015; sin año identificable como `"9"` o
  cadena vacía → `NULL`). Se descarta el texto original.
- **Rationale**: D7. V3.7 (2026-09-07) confirma que el texto libre es acotado (14
  casos no estándar + 1 ausente sobre 277). Solo interesa el año.  `smallint`
  (rango −32768..32767) sobra para un año.
- **Alternativas descartadas**: (a) conservar el texto original en una columna
  aparte — D7 dice explícitamente que no interesa; sería deuda; (b) `date`
  completa — no hay día/mes confiables; (c) `integer` — innecesariamente ancho.

## D-09 — `actualizado_a` y demás marcas temporales

- **Decisión**: `timestamptz` (UTC). La migración convierte los Firestore
  `Timestamp` a `timestamptz` y **parsea explícitamente** el único
  `actualizado_a` que viene como string ISO (`"2025-07-04T18:13:52.115Z"`).
- **Rationale**: FR-027 y V2.8/V2.9 (2026-09-07): 115/116 Timestamp, 1 string
  ISO, 0 ausentes. `timestamptz` es el tipo correcto para instantes absolutos.
  Las marcas de perfil de usuario (`created_at`, `last_sign_in_time`,
  `created_at_google`) también van a `timestamptz NULL`.
- **Alternativas descartadas**: `timestamp` sin zona — pierde la referencia UTC
  que traen los Timestamp de Firestore; texto — no permite comparar/ordenar.

## D-10 — `legacy_id`

- **Decisión**: `legacy_id integer NULL`.
- **Rationale**: FR-008 y V2.11 (2026-09-07): siempre string numérico o `null`
  (8 nulls de 116), sin inconsistencias, sin ceros a la izquierda, valores
  chicos (máx `"1901"`). El dato de origen está congelado (Firestore
  solo-lectura), así que el tipo es seguro. Es el identificador del sistema
  legado usado para matcheo histórico.
- **Alternativas descartadas**: `text` — más conservador, pero implicaría que el
  valor podría no ser numérico, cosa que la verificación descarta sobre datos
  congelados; se registra como la alternativa si una carga futura reintrodujera
  legacy ids no numéricos.

## D-11 — Coordenadas de localidad

- **Decisión**: `latitud` y `longitud` como `double precision NOT NULL`.
- **Rationale**: V5.4 (2026-09-07): siempre numéricas, sin faltantes; precisión
  de hasta ~14 decimales en los datos. `double precision` las representa sin
  pérdida. No se adopta PostGIS: ninguna feature actual hace geoconsultas; las
  coordenadas alimentan un mapa externo.
- **Alternativas descartadas**: `numeric(9,6)` — truncaría la precisión
  observada; tipo `point`/PostGIS — sin caso de uso, agrega dependencia.

## D-12 — Taxonomía 1:1

- **Decisión**: tabla `evaluaciones_taxonomicas` con `organismo_id` como PK
  (FK a `organismos`), lo que impone "a lo sumo una por organismo" por
  construcción. Nueve columnas de código (una por dimensión) con `CHECK` contra
  el catálogo de su dimensión.
- **Rationale**: FR-021/022. V0.3/V7.2 (2026-09-07) confirman 1:1 sin
  excepciones (0 organismos con más de un doc; 0 docs con id ≠ `v1`). Usar
  `organismo_id` como PK hace imposible una segunda evaluación. De los 88
  organismos que exigen taxonomía, los 88 tienen las 9 columnas completas
  (V4.2); 89 tienen doc (V4.1) — el organismo extra sobre 88 se migra igual si
  su doc está completo.
- **Alternativas descartadas**: (a) tabla con id propio + UNIQUE(organismo_id) —
  equivalente, pero la PK sobre `organismo_id` es más directa para 1:1; (b) 9
  columnas embebidas en `organismos` — mezcla dos entidades y deja 27 organismos
  con 9 columnas nulas.

## D-13 — Trazabilidad al origen y reconciliación

- **Decisión**: cada tabla migrada lleva `firestore_id text UNIQUE` (el doc-id
  original; para `usuarios` coincide con el email). Una tabla operativa
  `migracion_reconciliacion` registra, por entidad: conteo origen, conteo
  destino, resultado y timestamp de corrida.
- **Rationale**: Principios IX y X, FR-031/032, SC-008. `firestore_id` (a)
  resuelve las FK durante la carga (mapea doc-id → id subrogado), y (b) ancla
  cada fila a su registro en el respaldo Firestore de solo-lectura para
  auditoría. La tabla de reconciliación es el artefacto que hace "cero pérdida"
  verificable en vez de "corrió sin error".
- **Alternativas descartadas**: no persistir el doc-id — rompería la
  resolución de FK y la auditoría contra el respaldo; log solo en archivo — la
  tabla lo hace consultable con SQL junto a los datos.

## D-14 — Toolchain de migración

- **Decisión**: herramienta de un solo uso en Node.js 20 que reutiliza
  `firebase-admin` (lectura del origen, ya usado por los scripts de verificación)
  y `pg` (node-postgres) para la carga. Credenciales cargadas desde variables de
  entorno / gestor de secretos, **sin rutas hardcodeadas** (Principio XIII).
  Orden de carga respetando dependencias de FK (ver [quickstart.md](./quickstart.md)).
- **Rationale**: el toolchain de verificación fechada ya está escrito en este
  stack y con acceso admin a Firestore; reutilizarlo minimiza superficie nueva.
  **No es el backend de la app** (que está fuera de alcance por input del
  usuario): es utilería de migración desechable tras el cierre.
- **Alternativas descartadas**: (a) exportar Firestore a BigQuery y de ahí a
  Postgres — reintroduce GCP en la ruta (Principio I) y agrega un salto; (b)
  reescribir la extracción en otro lenguaje — descarta el toolchain ya
  verificado sin beneficio.

---

## Resumen de decisiones

| # | Tema | Decisión |
|---|---|---|
| D-01 | Motor | PostgreSQL 17 self-hosted, sin restricciones |
| D-02 | Claves subrogadas | `bigint GENERATED ALWAYS AS IDENTITY` (no UUID) |
| D-03 | Nombres | `snake_case`, tablas en plural |
| D-04 | Email | `citext UNIQUE`, no PK; normalizado a minúscula |
| D-05 | Vocabularios | Tablas de referencia (dominio) / `CHECK` (taxonomía) / `enum` (estados) |
| D-06 | `fuero_simplificado` | Vista + relación N:M + `estado_fueros` |
| D-07 | Jueces en UF | Discriminador `modo_jueces` + `CHECK` de exclusividad |
| D-08 | `anio_implementacion` | `smallint NULL`, extracción por regla D7 |
| D-09 | Marcas temporales | `timestamptz` UTC, parseo del ISO único |
| D-10 | `legacy_id` | `integer NULL` |
| D-11 | Coordenadas | `double precision NOT NULL` |
| D-12 | Taxonomía | Tabla 1:1 con `organismo_id` como PK |
| D-13 | Trazabilidad | `firestore_id` por tabla + `migracion_reconciliacion` |
| D-14 | Migración | Node.js + firebase-admin + pg, credenciales por env |
