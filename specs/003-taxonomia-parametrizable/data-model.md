# Data Model: Taxonomía de organismos parametrizable por preguntas

Feature `003-taxonomia-parametrizable`. Toca exclusivamente 4 tablas de
`public.*` (3 nuevas + 1 reformulada); nada más del esquema de
`001-modelo-datos-relacional` cambia — verificado explícitamente en
`quickstart.md`.

## Entidades

### `taxonomia_preguntas` (nueva)

Reemplaza a las 9 columnas fijas de `evaluaciones_taxonomicas` (vieja).

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `bigint IDENTITY` | PK |
| `codigo` | `text NOT NULL UNIQUE` | nombre de la columna/dimensión actual (`autonomia`, `insercion_institucional`, ...) — estable, no cambia al migrar |
| `texto` | `text NOT NULL` | el texto de la pregunta. Para las 9 migradas, **igual a `codigo`** (Assumption de `spec.md`: no existe hoy un texto más descriptivo que migrar — `src/components/TaxonomiaForm.jsx` solo muestra el nombre del campo) |
| `grupo` | `text NOT NULL CHECK IN ('gestion','institucional','organizacion','implementacion')` | mismo agrupamiento que hoy (`GRUPO_POR_DIMENSION`, `migration/src/transform/taxonomia.js`) |
| `tipo_respuesta` | `text NOT NULL CHECK IN ('opcion_unica','opcion_multiple','numerica','texto_libre')` | las 9 migradas quedan en `opcion_unica` (FR-009) |
| `orden` | `smallint` | orden de despliegue dentro de su grupo |

### `taxonomia_pregunta_tipos_oficina` (nueva, bridge)

"A qué tipo(s) de organismo aplica" — informativo (FR-012), no
restrictivo. Reemplaza, con integridad explícita (Principio VIII), lo que
hoy es solo un hecho implícito en los datos (ninguna `coordinación` tiene
evaluación cargada).

| Columna | Tipo | Notas |
|---|---|---|
| `pregunta_id` | `bigint NOT NULL REFERENCES taxonomia_preguntas(id) ON DELETE CASCADE` | |
| `tipo_oficina_id` | `smallint NOT NULL REFERENCES tipos_oficina(id)` | |
| PK | `(pregunta_id, tipo_oficina_id)` | |

Para las 9 preguntas migradas: `oficina judicial` y
`oficina judicial especializada` (los dos tipos que concentran 88 de las 89
evaluaciones reales — verificado, no asumido). **No** se le asigna
`coordinación` ni `unidad operativa`, aunque exista 1 caso real de `unidad
operativa` con evaluación cargada (Edge Case de `spec.md`) — ese caso migra
igual porque esta tabla no se usa para validar respuestas existentes
(FR-012).

### `taxonomia_opciones` (nueva)

Reemplaza a `taxonomia_codigos` — deja de ser un catálogo global
compartido; cada opción pertenece a una sola pregunta.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `bigint IDENTITY` | PK |
| `pregunta_id` | `bigint NOT NULL REFERENCES taxonomia_preguntas(id) ON DELETE CASCADE` | |
| `codigo` | `text NOT NULL` | la letra original (`A`, `B`, `C`...) — se conserva por trazabilidad, ya no es la clave de unicidad global |
| `etiqueta` | `text NOT NULL` | igual que `taxonomia_codigos.etiqueta` hoy |
| `orden` | `smallint` | igual que `taxonomia_codigos.orden` hoy |
| UNIQUE | `(pregunta_id, codigo)` | el código es único **dentro de su pregunta**, no global — dos preguntas distintas pueden tener ambas una opción `"A"`, y no son la misma opción |

### `evaluaciones_taxonomicas` (reformulada — antes 9 columnas, ahora tabla de respuestas)

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `bigint IDENTITY` | PK |
| `organismo_id` | `bigint NOT NULL REFERENCES organismos(id) ON DELETE CASCADE` | ya no es 1:1 vía PK — un organismo tiene 0..N respuestas |
| `pregunta_id` | `bigint NOT NULL REFERENCES taxonomia_preguntas(id)` | |
| `opcion_id` | `bigint REFERENCES taxonomia_opciones(id)` | NOT NULL solo si la pregunta es `opcion_unica`/`opcion_multiple` |
| `valor_texto` | `text` | NOT NULL solo si la pregunta es `texto_libre` |
| `valor_numero` | `numeric` | NOT NULL solo si la pregunta es `numerica` |
| `creado_a` | `timestamptz NOT NULL DEFAULT now()` | |
| `CHECK` | exactamente uno de `opcion_id`/`valor_texto`/`valor_numero` no nulo | forma básica — no valida que la opción sea de la pregunta correcta ni el tipo de la pregunta, eso lo hace el trigger |

**Trigger `trg_respuesta_taxonomia_valida`** (`BEFORE INSERT OR UPDATE`,
mismo patrón que `trg_asignacion_fuero_dentro_de_uf` de
`001-modelo-datos-relacional` — research.md Decisión 2), valida en una sola
función:

1. Si `opcion_id` no es NULL, resuelve a una opción cuyo `pregunta_id`
   coincide con el `pregunta_id` de la fila (FR-007).
2. La forma de la respuesta (opción vs. valor libre) coincide con
   `taxonomia_preguntas.tipo_respuesta` de esa pregunta (FR-004, FR-008):
   `opcion_unica`/`opcion_multiple` → exige `opcion_id`, prohíbe los
   valores libres; `numerica` → exige `valor_numero`; `texto_libre` → exige
   `valor_texto`.
3. Si la pregunta es `opcion_unica`, `numerica` o `texto_libre` (NO
   `opcion_multiple`), no puede existir ya otra fila con el mismo
   `(organismo_id, pregunta_id)` (FR-006) — excepto la fila que se está
   actualizando.

### `evaluaciones_taxonomicas_v1_legacy` (nueva, temporal)

La tabla vieja de 9 columnas, renombrada (research.md Decisión 4) — se
conserva sin cambios de forma, solo de nombre, como respaldo auditable
hasta una migración posterior que decida borrarla. No se le agrega, quita
ni modifica ninguna columna.

## Relación con el modelo existente (sin cambios)

- `organismos`, `usuarios`, `unidades_funcionales`, `pools_jueces`
  (`grupos_jueces`), `auth.*` — **ninguna** columna, tabla, constraint ni
  índice se modifica. Verificado en `quickstart.md`.
- `tipos_oficina` — se referencia (FK nueva desde
  `taxonomia_pregunta_tipos_oficina`), no se modifica.
- `migracion_reconciliacion` — se usa (se inserta una fila), no se modifica
  su forma (research.md Decisión 3).

## Validaciones de negocio derivadas de los Functional Requirements

| Regla | Mecanismo | FR |
|---|---|---|
| Pregunta = dato, no columna | `taxonomia_preguntas` como tabla | FR-001 |
| 4 tipos de respuesta soportados | `CHECK` en `tipo_respuesta` | FR-002 |
| Opciones no se comparten entre preguntas | `taxonomia_opciones.pregunta_id` + `UNIQUE(pregunta_id, codigo)` | FR-003 |
| Pregunta no categórica sin opciones | Trigger, punto 2 | FR-004 |
| Respuesta = fila propia, no columna | `evaluaciones_taxonomicas` reformulada | FR-005 |
| Varias respuestas solo si `opcion_multiple` | Trigger, punto 3 | FR-006 |
| Respuesta rechazada si la opción es de otra pregunta | Trigger, punto 1 | FR-007 |
| Respuesta rechazada si la forma no coincide con el tipo de pregunta | Trigger, punto 2 | FR-008 |
| Migración de las 9 preguntas actuales | `contracts/migration-0001-taxonomia.sql`, sección 2 | FR-009 |
| Migración de los 32 códigos actuales | `contracts/migration-0001-taxonomia.sql`, sección 3 | FR-010 |
| Migración de las 89 evaluaciones, reconciliada | `contracts/migration-0001-taxonomia.sql`, sección 4-5 | FR-011 |
| "Aplica a tipo" informativo, no restrictivo | Sin FK desde `evaluaciones_taxonomicas` hacia `taxonomia_pregunta_tipos_oficina` — son tablas independientes | FR-012 |
| Pregunta nueva sin `ALTER TABLE` | Estructura ya parametrizada — insertar filas alcanza | FR-013 |
