# Modelo de datos relacional

**Feature**: 001-modelo-datos-relacional | **Fecha**: 2026-09-07

Modelo lógico normalizado que reemplaza el almacenamiento en Firestore. Las
decisiones de tipo, clave, nulidad y materialización están justificadas en
[research.md](./research.md); el DDL autoritativo está en
[contracts/schema.sql](./contracts/schema.sql). Este documento describe las
entidades, sus atributos, sus relaciones y las reglas de validación y migración,
con el mapeo campo a campo desde Firestore.

Convenciones: `snake_case`; claves subrogadas `bigint GENERATED ALWAYS AS
IDENTITY`; email `citext UNIQUE`; `timestamptz` en UTC. Cada tabla migrada lleva
`firestore_id` para trazabilidad al respaldo de solo-lectura (Principio IX/X).

---

## Diagrama de relaciones (resumen)

```text
provincias ─┐ (FK provincia en: usuarios, organismos, localidades, pools_jueces)
            │
usuarios ──< usuario_roles >── roles
   │  ▲
   │  └────────────< organismo_editores >──┐
   │ (propietario_id)                       │
   ▼                                        ▼
organismos ──< organismo_fueros >── fueros
   │  │  denominacion_simplificada → denominaciones_simplificadas
   │  │  tipo_oficina             → tipos_oficina
   │  │  estado_fueros (enum)
   │  ├──── evaluaciones_taxonomicas (1:1, PK = organismo_id)
   │  └──< unidades_funcionales
   │            │  tipo_uf → tipos_uf
   │            │  modo_jueces (enum) + jueces_asistidos | pool_jueces_id
   │            ├── localidad_id → localidades
   │            └── pool_jueces_id → pools_jueces (opcional)
   ▼
vista_fuero_simplificado (deriva fuero_simplificado por organismo)
migracion_reconciliacion (operativa: conteos por entidad)
```

---

## 1. Vocabularios controlados (tablas de referencia)

Tablas de catálogo con FK desde las entidades. Se siembran antes de la
migración (FR-024). Estrategia y alternativas: ver research **D-05**.

### 1.1 `provincias`

| Columna | Tipo | Reglas |
|---|---|---|
| `id` | `smallint` PK IDENTITY | |
| `nombre` | `text NOT NULL UNIQUE` | Grafía canónica (sin tildes donde el dato la omite: `Entre Rios`, `Rio Negro`) |

Semilla: 24 valores de `organismoOptions.provinciaOptions` (incluye `La Rioja`,
`Misiones`, `Santa Cruz`, que aún no tienen localidades). Referenciada por
`usuarios`, `organismos`, `localidades`, `pools_jueces`.

### 1.2 `tipos_oficina`

`id smallint PK` · `nombre text NOT NULL UNIQUE`. Semilla (4, en minúscula, tal
como el dato real): `oficina judicial`, `oficina judicial especializada`,
`coordinación`, `unidad operativa`. Referenciada por `organismos.tipo_oficina_id`.
Determina si el organismo exige taxonomía.

### 1.3 `denominaciones_simplificadas`

`id smallint PK` · `nombre text NOT NULL UNIQUE`. Semilla: los 10 valores del
catálogo vigente (V2.4 confirma que los 116 organismos usan solo estos 10; no
aparece el catálogo anterior de 39). Referenciada por
`organismos.denominacion_simplificada_id`.

### 1.4 `tipos_uf`

`id smallint PK` · `nombre text NOT NULL UNIQUE`. Semilla (3, V3.2):
`Delegación`, `Subdelegación`, `Área Específica`. Referenciada por
`unidades_funcionales.tipo_uf_id`.

### 1.5 `fueros`

`id smallint PK` · `nombre text NOT NULL UNIQUE`. Semilla (4 fueros concretos):
`penal`, `civil`, `familia`, `laboral`. **`multifuero` NO es un fuero**: es un
valor calculado (ver `vista_fuero_simplificado`). El catálogo se amplía con un
`INSERT` si la carga de referentes revela fueros nuevos, sin cambiar la
estructura. Referenciada por `organismo_fueros`.

### 1.6 `roles`

`id smallint PK` · `nombre text NOT NULL UNIQUE`. Semilla (2, V1.7): `admin`,
`usuario_normal`. Referenciada por `usuario_roles`.

### 1.7 `taxonomia_codigos` (etiquetas de dimensiones)

`dimension text` · `codigo text` · `etiqueta text NOT NULL` · `orden smallint` ·
PK `(dimension, codigo)`. Semilla desde `taxonomiaOptions.js` (valor→label por
dimensión). Provee las etiquetas legibles para reporting; la validación de qué
código es válido en cada columna la impone el `CHECK` de
`evaluaciones_taxonomicas` (ver §7). Catálogo por dimensión:

| Dimensión | Códigos válidos |
|---|---|
| `autonomia` (gestión) | A, B, C, D |
| `insercion_institucional` | A, B, C |
| `jerarquia_normativa` | A, B, C, D |
| `dependencia` | A, B, C, D |
| `asistencia_jurisdiccional` | A, B, C |
| `alcance_proceso` | A, B, C, D |
| `alcance_fuero` | A, B, C, **E** |
| `presencia_territorial` | A, B, C, D |
| `grado_implementacion` | A, B |

---

## 2. `usuarios`

Persona que accede al sistema. Identidad primaria por id subrogado; email como
atributo único (Principio V, D4). Origen: colección `users` (doc-id = email).

| Columna | Tipo | Reglas | Origen Firestore |
|---|---|---|---|
| `id` | `bigint` PK IDENTITY | Identidad primaria | — (subrogado nuevo) |
| `email` | `citext NOT NULL UNIQUE` | Normalizado a minúscula; único case-insensitive | doc-id / `email` |
| `nombre_display` | `text NULL` | | `displayName` |
| `email_verificado` | `boolean NOT NULL DEFAULT false` | | `emailVerified` |
| `foto_url` | `text NULL` | | `photoURL` |
| `provincia_id` | `smallint NULL REFERENCES provincias` | | `provincia` |
| `creado_a` | `timestamptz NULL` | | `createdAt` (string ISO) |
| `ultimo_ingreso_a` | `timestamptz NULL` | | `lastSignInTime` |
| `creado_a_google` | `timestamptz NULL` | | `createdAtGoogle` |
| `firestore_id` | `text NOT NULL UNIQUE` | = email de origen (trazabilidad) | doc-id |

Reglas / notas de migración:
- **FR-004/005**: `email` no es PK; unicidad case-insensitive por `citext`. V1.1:
  46/46 ids en minúscula coincidentes con `email`, 0 colisiones → no hay fusión.
- **FR-006**: se capturan todos los atributos de perfil actuales.
- **Perfiles mínimos**: 3 usuarios traen solo `{email, rol, provincia}` (V1.5);
  el resto de columnas se migra como `NULL`, no como error.
- Relaciones: N:M con `roles` (vía `usuario_roles`); 1:N como propietario de
  `organismos`; N:M como editor (vía `organismo_editores`).

### 2.1 `usuario_roles` (N:M usuario↔rol)

`usuario_id bigint FK` · `rol_id smallint FK` · PK `(usuario_id, rol_id)`.

- **FR-007**: reemplaza el array `rol` por una relación normalizada. V1.6: `rol`
  siempre array; V1.7: valores solo `usuario_normal`/`admin`. Todo usuario
  obtiene `usuario_normal`; los 3 admin obtienen además `admin`.

---

## 3. `organismos`

Oficina judicial relevada. Origen: colección `organismos` (id autogenerado).

| Columna | Tipo | Reglas | Origen Firestore |
|---|---|---|---|
| `id` | `bigint` PK IDENTITY | | — (subrogado) |
| `denominacion` | `text NOT NULL` | | `denominacion` |
| `denominacion_simplificada_id` | `smallint NOT NULL REFERENCES denominaciones_simplificadas` | | `denominacion_simplificada` |
| `tipo_oficina_id` | `smallint NOT NULL REFERENCES tipos_oficina` | | `tipo_oficina` |
| `provincia_id` | `smallint NOT NULL REFERENCES provincias` | | `provincia` |
| `propietario_id` | `bigint NOT NULL REFERENCES usuarios` | Reemplaza `usuario_google` (email) | `usuario_google` |
| `estado_fueros` | `estado_fueros_enum NOT NULL` | `cargado` / `multifuero_sin_detalle` / `sin_fueros_asignados` | derivado de `fuero_simplificado` |
| `legacy_id` | `integer NULL` | Id del sistema legado (matcheo histórico) | `legacy_id` |
| `actualizado_a` | `timestamptz NOT NULL` | Parseo del ISO único (V2.9) | `actualizado_a` |
| `firestore_id` | `text NOT NULL UNIQUE` | Trazabilidad | doc-id |

Reglas / notas:
- **FR-008**: `legacy_id` nullable (8 nulls, V2.11).
- **FR-009**: propiedad como FK a `usuarios.id`, no email. V1.10/V2.13: 0
  `usuario_google` roto → todos resuelven.
- **FR-013/014** y **D-06**: `estado_fueros` distingue los dos estados de
  migración de los organismos con fueros cargados. Ver §5 y §6.
- `taxonomia` de Firestore **no** es un campo de este registro: es su propia
  entidad (§7).

### 3.1 `organismo_editores` (N:M organismo↔usuario)

`organismo_id bigint FK` · `usuario_id bigint FK` · PK `(organismo_id,
usuario_id)`.

- **FR-010**: reemplaza el array `editores[]` (emails) por relación por id
  subrogado, sin duplicados (la PK compuesta lo garantiza) ni diferencias de
  casing. V2.10: `editores` siempre array, 0 duplicados; V2.13: 0 emails rotos.

### 3.2 `organismo_fueros` (N:M organismo↔fuero)

`organismo_id bigint FK` · `fuero_id smallint FK` · PK `(organismo_id,
fuero_id)`.

- **FR-011**: un organismo asiste a 0, 1 o varios fueros. Solo se guardan los
  **fueros concretos conocidos**. Un organismo `multifuero_sin_detalle` no tiene
  filas acá (se desconoce cuáles); un organismo `cargado` con 1 fuero tiene 1
  fila.

---

## 4. `unidades_funcionales`

Delegación / subdelegación / área específica de un organismo. Origen:
subcolección `organismos/{id}/unidades_funcionales`.

| Columna | Tipo | Reglas | Origen Firestore |
|---|---|---|---|
| `id` | `bigint` PK IDENTITY | | — (subrogado) |
| `organismo_id` | `bigint NOT NULL REFERENCES organismos` | Pertenencia a un único organismo | (organismo padre) |
| `denominacion_unidad` | `text NOT NULL` | | `denominacion_unidad` |
| `localidad_id` | `bigint NOT NULL REFERENCES localidades` | Integridad garantizada | `localidad_id` |
| `tipo_uf_id` | `smallint NOT NULL REFERENCES tipos_uf` | | `tipo_uf` |
| `modo_jueces` | `modo_jueces_enum NOT NULL` | `cantidad_directa` / `pool` / `no_aplica` | derivado (V3.3) |
| `jueces_asistidos` | `integer NULL CHECK (>= 0)` | Solo si `modo=cantidad_directa` | `jueces_asistidos` |
| `pool_jueces_id` | `bigint NULL REFERENCES pools_jueces` | Solo si `modo=pool` | `pool_jueces_id` |
| `anio_implementacion` | `smallint NULL` | Año extraído por regla D7 | `anio_implementacion` |
| `domicilio` | `text NULL` | | `domicilio` |
| `telefono` | `text NULL` | | `telefono` |
| `mail` | `text NULL` | | `mail` |
| `responsable` | `text NULL` | | `responsable` |
| `codigo_postal` | `text NULL` | Texto (puede tener ceros/letras) | `codigo_postal` |
| `firestore_id` | `text NOT NULL UNIQUE` | Trazabilidad | doc-id |

Reglas / notas:
- **FR-015**: pertenece a un único organismo (FK NOT NULL). `anio_implementacion`
  = `smallint NULL`, extracción D7 (D-08): `"1/7/2021"`→2021; `"2015.
  Refuncionalización 2024"`→2015; `"9"`/`""`→`NULL`.
- **FR-016/017**: `localidad_id` FK NOT NULL; `pool_jueces_id` FK opcional. V3.9:
  0 `localidad_id` roto; V3.10: 0 `pool_jueces_id` roto.
- **FR-018 / D-07**: `CHECK` de exclusividad de los tres modos de jueces:
  - `modo_jueces='cantidad_directa'` → `jueces_asistidos IS NOT NULL AND pool_jueces_id IS NULL`
  - `modo_jueces='pool'` → `pool_jueces_id IS NOT NULL AND jueces_asistidos IS NULL`
  - `modo_jueces='no_aplica'` → `jueces_asistidos IS NULL AND pool_jueces_id IS NULL`
  V3.3: 0 con ambos, 2 con ninguno → `no_aplica` (organismos administrativos).
- **Vacíos legítimos** (V3.4): `telefono` (12), `responsable` (12), `mail` (10),
  `domicilio`/`codigo_postal` (2), `anio_implementacion` (1) → migran como
  `NULL`; completitud es carga posterior. `jueces_asistidos` vacío (36) se
  resuelve por el modo (los pool tienen `jueces_asistidos NULL` por diseño).

---

## 5. `localidades`

Origen: colección `localidades` (id autogenerado). No se escribe desde la UI.

| Columna | Tipo | Reglas | Origen Firestore |
|---|---|---|---|
| `id` | `bigint` PK IDENTITY | | — (subrogado) |
| `nombre` | `text NOT NULL` | | `nombre` |
| `provincia_id` | `smallint NOT NULL REFERENCES provincias` | | `provincia` |
| `latitud` | `double precision NOT NULL` | | `latitud` |
| `longitud` | `double precision NOT NULL` | | `longitud` |
| `firestore_id` | `text NOT NULL UNIQUE` | Trazabilidad | doc-id |

- **FR-019**. `UNIQUE (nombre, provincia_id)` (V5.2: 0 duplicados). V5.4:
  coordenadas siempre numéricas → `double precision` (D-11). 129 localidades;
  algunas pueden no estar referenciadas por ninguna UF (V6.6 no corrida; no
  bloquea).

---

## 6. `pools_jueces`

Agrupación de jueces con una cantidad. Origen: colección `pools_jueces`.

| Columna | Tipo | Reglas | Origen Firestore |
|---|---|---|---|
| `id` | `bigint` PK IDENTITY | | — (subrogado) |
| `descripcion` | `text NOT NULL` | | `descripcion` |
| `cantidad_jueces` | `integer NOT NULL CHECK (>= 0)` | | `cantidad_jueces` |
| `provincia_id` | `smallint NOT NULL REFERENCES provincias` | | `provincia` |
| `firestore_id` | `text NOT NULL UNIQUE` | Trazabilidad | doc-id |

- **FR-020**. V6.3: 0 sin descripción/provincia/cantidad; V6.4: `cantidad_jueces`
  siempre número. V3.11: 0 pools con provincia distinta a la del organismo en
  modo pool.

---

## 7. `evaluaciones_taxonomicas`

Valoración de un organismo en 9 dimensiones agrupadas, a lo sumo una por
organismo. Origen: subcolección `organismos/{id}/taxonomia`, doc `v1`.

| Columna | Tipo | Grupo | Códigos válidos (`CHECK`) |
|---|---|---|---|
| `organismo_id` | `bigint PK REFERENCES organismos` | — | (1:1) |
| `autonomia` | `text NOT NULL` | gestión | A,B,C,D |
| `insercion_institucional` | `text NOT NULL` | institucional | A,B,C |
| `jerarquia_normativa` | `text NOT NULL` | institucional | A,B,C,D |
| `dependencia` | `text NOT NULL` | organización | A,B,C,D |
| `asistencia_jurisdiccional` | `text NOT NULL` | organización | A,B,C |
| `alcance_proceso` | `text NOT NULL` | implementación | A,B,C,D |
| `alcance_fuero` | `text NOT NULL` | implementación | A,B,C,E |
| `presencia_territorial` | `text NOT NULL` | implementación | A,B,C,D |
| `grado_implementacion` | `text NOT NULL` | implementación | A,B |

Reglas / notas:
- **FR-021/022 / D-12**: PK sobre `organismo_id` impone 1:1. V0.3/V7.2: 1:1 sin
  excepciones. La agrupación (gestión / institucional / organización /
  implementación) es lógica; las 9 dimensiones son columnas planas.
- **FR-023**: solo se materializan organismos con la evaluación **completa**
  (los 88 que la exigen la tienen completa, V4.2; 89 con doc, V4.1). V4.4/V4.5: 0
  campos ausentes/vacíos, 0 grupos vacíos. Antes de la carga se corre la
  verificación de formas divergentes no cubiertas (V4.3/V4.6/V4.7: doble-anidado,
  no-string, códigos fuera de catálogo) y, si aparecieran, se canonicalizan.
- Los 27 organismos sin taxonomía simplemente no tienen fila acá.

---

## 8. `vista_fuero_simplificado` (valor derivado, D3 / D-06)

Vista que expone `fuero_simplificado` por organismo sin almacenarlo a mano
(FR-012). Lógica:

| Situación | `fuero_simplificado` |
|---|---|
| `estado_fueros='cargado'` y >1 fuero en `organismo_fueros` | `'multifuero'` |
| `estado_fueros='cargado'` y exactamente 1 fuero | el nombre de ese fuero |
| `estado_fueros='multifuero_sin_detalle'` | `'multifuero'` |
| `estado_fueros='sin_fueros_asignados'` | `NULL` |

- La consume el reporting directamente (resuelve el impacto en Data Studio de
  D3). Estado inicial (2026-09-07): 96 organismos `cargado` con 1 fuero, 20
  `multifuero_sin_detalle`, 0 `sin_fueros_asignados`.

---

## 9. `migracion_reconciliacion` (operativa, Principio X)

Registro de reconciliación por entidad. No es dato de dominio; es evidencia de
cero pérdida (FR-031, SC-008).

| Columna | Tipo | Reglas |
|---|---|---|
| `id` | `bigint` PK IDENTITY | |
| `entidad` | `text NOT NULL` | nombre lógico de la entidad migrada |
| `conteo_origen` | `integer NOT NULL` | filas contadas en Firestore |
| `conteo_destino` | `integer NOT NULL` | filas contadas en PostgreSQL |
| `resultado` | `text NOT NULL CHECK (resultado IN ('coincide','discrepancia_resuelta','discrepancia_abierta'))` | |
| `corrida_a` | `timestamptz NOT NULL DEFAULT now()` | fecha de la corrida |
| `detalle` | `text NULL` | nota de resolución si hubo discrepancia |

- **FR-032**: `resultado='discrepancia_abierta'` marca que la migración de esa
  entidad debe detenerse hasta resolver. "Corrió sin error" no alcanza.

---

## Tipos enumerados internos (`enum` nativo, D-05)

- `estado_fueros_enum`: `('cargado', 'multifuero_sin_detalle', 'sin_fueros_asignados')`
- `modo_jueces_enum`: `('cantidad_directa', 'pool', 'no_aplica')`

---

## Cobertura de colecciones y campos (SC-001)

| Colección Firestore | Entidad(es) del modelo |
|---|---|
| `users` | `usuarios` + `usuario_roles` |
| `organismos` | `organismos` + `organismo_editores` + `organismo_fueros` |
| `organismos/*/unidades_funcionales` | `unidades_funcionales` |
| `organismos/*/taxonomia` (v1) | `evaluaciones_taxonomicas` |
| `localidades` | `localidades` |
| `pools_jueces` | `pools_jueces` |

Campos sin columna directa, con decisión de descarte registrada (FR-002,
Principio XI): estructura de versionado `v1` de taxonomía (se aplana a
`evaluaciones_taxonomicas`, id `v1` descartado por V0.3); texto original de
`anio_implementacion` (descartado por D7, solo se guarda el año). V0.2 confirma 0
colecciones inesperadas (FR-003).
