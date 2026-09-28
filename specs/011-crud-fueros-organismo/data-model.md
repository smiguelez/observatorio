# Data Model: editar los fueros de un organismo (011)

No hay entidades nuevas ni migración: `organismo_fueros`, `fueros` y
`vista_fuero_simplificado` ya existen (`db/schema.sql`). Esta feature solo
agrega un camino de escritura sobre datos ya modelados.

## Entidades existentes involucradas

| Entidad | Campos relevantes | Notas para esta feature |
|---|---|---|
| `fueros` | `id`, `nombre` | Catálogo fijo — esta feature no lo modifica, solo lo consulta (`GET /api/fueros`, ya existente desde `006`). |
| `organismo_fueros` | `organismo_id`, `fuero_id` (PK compuesta) | Lo que esta feature reemplaza completo en cada guardado — nunca altas/bajas parciales. |
| `organismos.estado_fueros` | `'cargado' \| 'multifuero_sin_detalle' \| 'sin_fueros_asignados'` | Transición nueva que agrega esta feature (research.md, Decisión 2): guardar un listado vacío ⇒ `sin_fueros_asignados`; guardar cualquier listado no vacío ⇒ `cargado`. Nunca produce `multifuero_sin_detalle` (exclusivo de la migración original). |
| `vista_fuero_simplificado` | `organismo_id`, `fuero_simplificado` (calculado) | Sin cambios — esta feature no toca su lógica (FR-008), solo hace que el listado del que depende sea editable. |
| `asignacion_fueros` (vía `unidad_funcional_grupo_jueces` → `unidades_funcionales`) | `asignacion_id`, `fuero_id` | Consultada (no modificada) por el chequeo de FR-004: ningún fuero que esta relación use puede desaparecer del listado del organismo sin que la operación se rechace. |

## Validación (FR-004)

Antes de reemplazar el listado, se calculan los fueros que el listado
nuevo DEJARÍA de tener (listado actual menos listado nuevo) y se verifica
que ninguno tenga una fila en `asignacion_fueros` para una unidad
funcional de este organismo. Si alguno la tiene, la operación completa se
rechaza (`400`) — no se escribe nada, ni el listado ni `estado_fueros`.

## Transición de `estado_fueros` (nueva, agregada por esta feature)

```
guardar listado vacío        -> estado_fueros = 'sin_fueros_asignados'
guardar listado no vacío     -> estado_fueros = 'cargado'
(nunca se produce 'multifuero_sin_detalle' desde este camino)
```

## Detector de relleno inicial (research.md, Decisión 3 — sin entidad nueva)

No persiste nada — es una consulta de una sola vez, de solo lectura salvo
que encuentre algo para reportar:

```sql
SELECT o.id
FROM organismos o
LEFT JOIN organismo_fueros ofu ON ofu.organismo_id = o.id
WHERE o.estado_fueros = 'cargado'
GROUP BY o.id
HAVING count(ofu.fuero_id) = 0;
```

Verificado (2026-09-28): 0 filas.
