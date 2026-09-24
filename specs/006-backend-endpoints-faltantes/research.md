# Research: Endpoints de backend que el frontend necesita y hoy no existen

Feature `006-backend-endpoints-faltantes`. Responde primero la pregunta
explícita del usuario (Decisión 1: ¿hace falta alguna migración de
esquema?) y documenta el resto de las decisiones de diseño necesarias
para los 5 grupos de endpoints.

---

## Decisión 1 — Ninguno de los 5 grupos necesita una migración de esquema nueva (premisa confirmada)

**Verificado grupo por grupo, contra el esquema real** (no asumido):

1. **Catálogos de referencia** (`provincias`, `denominaciones_simplificadas`,
   `tipos_oficina`, `tipos_uf`, `fueros`): son solo `SELECT` sobre tablas
   ya existentes, sin ningún filtro que dependa de una columna que falte.
   Nada que migrar.
2. **Fuero de organismo** (`organismo_fueros`, `vista_fuero_simplificado`):
   la vista ya existe (confirmado: `\d+ vista_fuero_simplificado`,
   `SELECT o.id, CASE ... END FROM organismos o LEFT JOIN organismo_fueros
   ofu ... LEFT JOIN fueros f ...`), calculada sobre `organismos.estado_fueros`
   (enum `cargado | multifuero_sin_detalle | sin_fueros_asignados`,
   confirmado por `enum_range`). Solo lectura. Nada que migrar.
3. **Asignación de jueces por UF** (`unidad_funcional_grupo_jueces`):
   tabla ya con `UNIQUE(unidad_funcional_id, grupo_jueces_id)`,
   `CHECK(cantidad_asignada > 0)`, y las dos FK — exactamente las 3
   reglas que FR-007/FR-008/FR-009 necesitan (D8, ya resuelto en
   `001-modelo-datos-relacional`). Confirmado que la tabla **no tiene
   ningún trigger propio** (`SELECT tgname FROM pg_trigger WHERE tgrelid
   = 'unidad_funcional_grupo_jueces'::regclass` → 0 filas) — toda su
   integridad ya está declarada por constraints simples, no hace falta
   agregar ninguna. Nada que migrar.
4. **Editores de organismo** (`organismo_editores`): PK compuesta
   `(organismo_id, usuario_id)` ya actúa como la restricción de "no
   duplicar editor" que FR-013 necesita; sin trigger propio (mismo
   chequeo que arriba, 0 filas). Nada que migrar.
5. **Catálogo de preguntas de taxonomía** (`taxonomia_preguntas` +
   `taxonomia_opciones` + `taxonomia_pregunta_tipos_oficina`): las 3
   tablas ya existen con la forma exacta que FR-014/FR-015 necesitan
   (`003-taxonomia-parametrizable`). Solo lectura, con un `JOIN`/filtro
   opcional por `tipo_oficina_id`. Nada que migrar.

**Conclusión**: la premisa del usuario se confirma para los 5 grupos —
esta feature es exclusivamente rutas y handlers nuevos (`backend/src/routes/`),
sin ningún archivo en `backend/migrations/`. No hay Decisión de migración
que tomar (a diferencia de `003`/`004`, que sí necesitaron una).

**Lo único verificado que no es "cero cambios de esquema" pero tampoco es
una migración**: las reglas de integridad de los grupos 3 y 4 ya están
garantizadas, pero **no por triggers con `RAISE EXCEPTION`** (como
`001`/`003`/`004`) sino por **constraints simples de Postgres**
(`UNIQUE`, `CHECK`, `FK`) — que producen `SQLSTATE` genéricos de Postgres,
no el `P0001` que ya sabe reconocer `esRechazoDeTrigger`
(`004-fix-taxonomia-endpoint`). Esto no es un gap de esquema — es un gap
de mapeo de errores en la capa de aplicación, resuelto en Decisión 2.

---

## Decisión 2 — Generalizar `esRechazoDeTrigger` en vez de duplicar el helper

**El hallazgo, verificado empíricamente contra la base real** (no
asumido): las violaciones de integridad de los grupos 3 y 4 no producen
`SQLSTATE P0001` (el código de un `RAISE EXCEPTION` de trigger, que
`backend/src/http/trigger-error.ts` ya reconoce desde `004`) — producen
los códigos estándar de Postgres para restricciones declarativas:

```
UF-pool duplicado (UNIQUE):        SQLSTATE 23505
cantidad_asignada <= 0 (CHECK):    SQLSTATE 23514
pool inexistente (FK):             SQLSTATE 23503
editor duplicado (PK):              SQLSTATE 23505
```

Si esta feature reusara `esRechazoDeTrigger` tal cual está, **ningún**
rechazo de los grupos 3/4 se detectaría como error de cliente — todos
caerían al `500` genérico, exactamente la clase de bug que `004` (D11)
corrigió para taxonomía. No repetir ese problema acá es el motivo
concreto de esta decisión, no una preferencia estética.

**Decisión**: generalizar el helper existente (no crear uno nuevo en
paralelo):

```ts
// backend/src/http/trigger-error.ts (extendido, no reemplazado)
const CODIGOS_INTEGRIDAD = new Set(['P0001', '23505', '23514', '23503'])

export function esRechazoDeIntegridad(err: unknown): err is { code: string; message: string; constraint?: string } {
  return typeof err === 'object' && err !== null && CODIGOS_INTEGRIDAD.has((err as { code?: string }).code ?? '')
}
```

`esRechazoDeTrigger` (el nombre y la firma que ya usa `004`) queda como
alias/caso particular para no romper el código existente que ya lo llama
con la garantía específica de `P0001`; `esRechazoDeIntegridad` es el que
usan los handlers nuevos de esta feature.

**Rationale**: es la misma idea de `004` (Decisión 4) aplicada a un
mecanismo de integridad distinto (constraints declarativos en vez de
triggers) — pero es el mismo *tipo* de problema ("¿esto que rechazó la
base es un error de negocio o un error de servidor?"), así que la
solución correcta es un helper que reconozca ambas familias de código,
no dos helpers casi idénticos mantenidos por separado. Evita repetir el
error de alcance que ya costó una feature entera (`004`) corregir.

**Alternatives considered**: un helper nuevo y separado
(`esRechazoDeConstraint`) — descartado, generaría exactamente la
duplicación de lógica de detección de "¿es un error de negocio?" que
Decisión 1 de `004` evitó para el caso de las funciones SQL reutilizables
— mismo argumento, aplicado acá al lado de la aplicación en vez del lado
de la base.

---

## Decisión 3 — Mensajes de error legibles por constraint, no el mensaje crudo de Postgres

**El problema**: a diferencia de los `RAISE EXCEPTION` de `001`/`003`/`004`
(escritos a mano, ya en español, ya pensados para el cliente), el mensaje
por default de una violación de `UNIQUE`/`CHECK`/`FK` es técnico y en
inglés-ish (p. ej. `duplicate key value violates unique constraint
"unidad_funcional_grupo_jueces_unidad_funcional_id_grupo_jue_key"`) — no
es algo que un frontend deba mostrarle a un usuario tal cual.

**Decisión**: una tabla de traducción pequeña, por nombre de constraint
(`err.constraint`, que `pg` expone), a un mensaje en español:

| Constraint | Mensaje |
|---|---|
| `unidad_funcional_grupo_jueces_unidad_funcional_id_grupo_jue_key` | "Ya existe una asignación de esta unidad funcional a ese pool." |
| `unidad_funcional_grupo_jueces_cantidad_asignada_check` | "La cantidad asignada debe ser mayor a 0." |
| `unidad_funcional_grupo_jueces_grupo_jueces_id_fkey` | "El pool de jueces indicado no existe." |
| `organismo_editores_pkey` | "Ese usuario ya es editor de este organismo." |
| `organismo_editores_usuario_id_fkey` | "El usuario indicado no existe." |

Un `constraint` no reconocido en la tabla devuelve el mensaje crudo de
Postgres como respaldo (nunca un 500 — sigue siendo 400, solo menos
prolijo), para no bloquear un caso no anticipado.

**Rationale**: FR-008/FR-009 (grupo 3) y el Edge Case de duplicar editor
(grupo 4) piden explícitamente "un error identificable" — un mensaje
técnico de Postgres es identificable para un desarrollador leyendo logs,
pero no para el mensaje que el frontend (`005`) va a mostrar a un
usuario real. Es una diferencia real de audiencia frente a los mensajes
de `004`, que ya nacieron en español.

**Alternatives considered**: devolver el mensaje crudo de Postgres
siempre — descartado, no cumple el espíritu de "error identificable" del
spec; devolver un mensaje genérico único ("dato inválido") sin distinguir
motivo — descartado, pierde precisión sin necesidad, cuando distinguir es
tan simple como un `switch` por nombre de constraint.

---

## Decisión 4 — Autorización: composiciones nuevas de reglas ya existentes, ninguna regla nueva

**Verificado**: `esOwnerOEditor()` (`backend/src/authz/rules.ts`) combina
propietario y editor en una sola función — no distingue cuál de los dos
es. FR-013 (gestión de editores) pide explícitamente que un editor **no**
pueda agregar/quitar otros editores, solo el propietario o un admin —
una regla más angosta que "puede gestionar el organismo" (que sí incluye
a los editores).

**Decisión**: en el handler de editores, comparar directo contra
`organismo.propietarioId` en vez de usar `puedeGestionarOrganismo`:

```ts
const puedeGestionarEditores = identidad.usuarioId === organismo.propietarioId || esAdmin(identidad)
```

Para los demás grupos (fuero, asignaciones de jueces, catálogo de
preguntas con filtro), la regla ya vigente de organismo
(`puedeGestionarOrganismo`, dueño/editor/admin) o "cualquier autenticado"
(catálogos) alcanza tal cual, sin componer nada distinto.

**Rationale**: no hace falta ninguna función nueva en `authz/rules.ts` —
`esAdmin()` y la comparación directa contra `propietarioId` (que
`buscarOrganismoParaAutorizar` ya devuelve) son suficientes. Es
exactamente el criterio que ya sienta `authz/rules.ts` en su propio
comentario de cabecera: las combinaciones se resuelven en el
*llamador*, no anidando funciones nuevas — esta feature sigue ese mismo
patrón para un caso (propietario-no-editor) que hasta ahora no había
hecho falta distinguir.

**Alternatives considered**: una función nueva
`esPropietarioOAdmin(identidad, organismo)` — evaluada y descartada: la
comparación es una sola línea, envolverla en una función para un único
call site no agrega claridad, y el patrón ya establecido prefiere
componer en el llamador.

---

## Decisión 5 — Forma de las rutas: subrutas de organismo donde la autorización ya es heredada, rutas propias para catálogos puros

- `GET /api/provincias`, `/api/denominaciones-simplificadas`,
  `/api/tipos-oficina`, `/api/tipos-uf`, `/api/fueros` — rutas nuevas,
  mismo patrón que `GET /api/localidades` (`002`): sin autorización más
  allá de "autenticado", sin parámetros.
- `GET /api/organismos/:orgId/fuero` — subruta nueva bajo `organismos.ts`,
  reusa `autorizarContraOrganismoPadre` tal cual (mismo patrón que
  taxonomía).
- `GET/POST/PATCH/DELETE /api/organismos/:orgId/unidades-funcionales/:ufId/asignaciones-jueces(/:asignacionId)` —
  subruta de UF, mismo patrón de autorización heredada del organismo
  padre.
- `GET/POST/DELETE /api/organismos/:orgId/editores(/:usuarioId)` —
  subruta de organismo, con la composición de autorización de Decisión 4.
- `GET /api/taxonomia/preguntas?tipoOficinaId=` — ruta nueva, propia
  (no anidada bajo organismo, porque es catálogo puro — el filtro por
  tipo es un parámetro de consulta, no una relación de autorización).

**Rationale**: sigue la convención ya establecida en `organismos.ts`
(subrutas para lo que hereda autorización del padre) y en
`localidades.ts` (rutas propias para catálogos puros) — ninguna
estructura nueva de archivos ni de convención de URLs.

**Alternatives considered**: un único archivo de rutas "catálogos" para
los 5 catálogos + el de preguntas — evaluado; se prefiere mantener
`taxonomia/preguntas` cerca de las demás rutas de taxonomía (coherencia
temática) y los 5 catálogos de referencia sí agrupados en un archivo
nuevo (`catalogos.ts`), ya que no tienen una "home" temática existente
como sí la tiene taxonomía.
