# Data Model: Endpoint de taxonomía de organismos, reconstruido para el modelo parametrizable

Feature `004-fix-taxonomia-endpoint`. No introduce entidades de datos
nuevas — reutiliza el modelo ya cerrado en `003-taxonomia-parametrizable`
(`taxonomia_preguntas`, `taxonomia_pregunta_tipos_oficina`,
`taxonomia_opciones`, `evaluaciones_taxonomicas`) y `organismos.tipo_oficina_id`
ya existente de `001-modelo-datos-relacional`. Este documento describe
únicamente lo que esta feature agrega: una función y un trigger nuevos
(Protección A), y la forma en la que la API expone/consume ese modelo.

## Función nueva: `taxonomia_pregunta_aplica_a_tipo`

```sql
taxonomia_pregunta_aplica_a_tipo(p_pregunta_id bigint, p_tipo_oficina_id smallint) RETURNS boolean
```

Verdadero si existe una fila en `taxonomia_pregunta_tipos_oficina` para ese
par — envuelve la única fuente de verdad de "qué preguntas aplican a qué
tipo de organismo", reutilizable desde SQL puro (trigger) o desde una
consulta emitida por la aplicación (`pg`). Ver research.md, Decisión 1.

## Trigger nuevo: `trg_evaluacion_tipo_organismo_valido` (Protección A)

`BEFORE INSERT OR UPDATE ON evaluaciones_taxonomicas`, función
`validar_pregunta_tipo_organismo()`:

- Resuelve `tipo_oficina_id` del organismo de la fila (`NEW.organismo_id`).
- Rechaza (`RAISE EXCEPTION`, `SQLSTATE P0001`) si
  `taxonomia_pregunta_aplica_a_tipo(NEW.pregunta_id, tipo_oficina_id)` es
  falso.
- Se ejecuta **además** de `trg_respuesta_taxonomia_valida` (`0001`) — dos
  triggers `BEFORE` independientes sobre la misma tabla, Postgres los
  corre a ambos (orden alfabético por nombre si importara, pero acá no
  interactúan: cada uno valida una dimensión distinta de la misma fila).
- No revalida filas existentes — solo corre en `INSERT`/`UPDATE` nuevos.
  Verificado (contracts/migration-0003-taxonomia-tipo-organismo.sql): la
  fila histórica del organismo id=311 no se toca al crear el trigger.

## Vista de consulta/reemplazo: "taxonomía de un organismo"

No es una tabla — es la forma en la que `GET`/`PUT
/api/organismos/:orgId/taxonomia` agrupan filas de `evaluaciones_taxonomicas`
por `pregunta_id`, con el texto/tipo de la pregunta y el código de
opción(es) ya resueltos por `JOIN`, para que el consumidor no necesite
conocer el esquema interno (spec.md, FR-001/FR-002).

**Forma de una entrada** (una por pregunta con al menos una respuesta):

| Campo | Tipo | Presente cuando |
|---|---|---|
| `pregunta.codigo` | string | siempre |
| `pregunta.texto` | string | siempre |
| `pregunta.grupo` | string | siempre |
| `pregunta.tipoRespuesta` | `opcion_unica \| opcion_multiple \| numerica \| texto_libre` | siempre |
| `opciones` | array de `{ codigo, etiqueta }` | `tipoRespuesta` es `opcion_unica`/`opcion_multiple` |
| `valorNumero` | number | `tipoRespuesta` es `numerica` |
| `valorTexto` | string | `tipoRespuesta` es `texto_libre` |

**Forma del body de `PUT`** (reemplazo completo):

```
{ "respuestas": [
  { "preguntaCodigo": string, "opcionesCodigos": string[] } |
  { "preguntaCodigo": string, "valorNumero": number } |
  { "preguntaCodigo": string, "valorTexto": string }
] }
```

Una pregunta ausente del array queda sin respuesta después del `PUT`
(FR-007). `respuestas: []` borra todas las respuestas del organismo
(FR-008).

## Extensión de `PATCH /api/organismos/:id` (Protección B)

No cambia la forma de `organismos` ni agrega columnas — agrega un campo
opcional al body ya existente:

```
{ ...campos ya existentes (denominacion, denominacionSimplificadaId, tipoOficinaId, provinciaId),
  "confirmarPerdidaTaxonomia"?: boolean }
```

**Regla** (solo cuando el body trae `tipoOficinaId` y difiere del actual):

1. Calcular preguntas huérfanas: las que el organismo ya respondió
   (`evaluaciones_taxonomicas` actual) y que `taxonomia_pregunta_aplica_a_tipo`
   dice que NO aplican al `tipoOficinaId` nuevo.
2. Si hay huérfanas y `confirmarPerdidaTaxonomia` no es `true`: rechazar
   (400) con la lista de preguntas/respuestas que se perderían — nada se
   aplica.
3. Si hay huérfanas y `confirmarPerdidaTaxonomia` es `true`: en una sola
   transacción, `DELETE` de esas respuestas + `UPDATE` del
   `tipo_oficina_id` — ambas o ninguna.
4. Si no hay huérfanas: el cambio de tipo procede igual que hoy, sin
   ningún campo nuevo involucrado.

## Relación con el modelo existente

Ninguna tabla cambia de forma. Se agregan 2 objetos de esquema
(`taxonomia_pregunta_aplica_a_tipo`, `validar_pregunta_tipo_organismo`) y 1
trigger, todos scoped a `evaluaciones_taxonomicas`/`taxonomia_pregunta_tipos_oficina`
— mismo alcance de tocado que declara spec.md.
