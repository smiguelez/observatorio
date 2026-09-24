# Data Model: Endpoints de backend que el frontend necesita y hoy no existen

Feature `006-backend-endpoints-faltantes`. No introduce entidades de
datos nuevas — expone, sin modificar, tablas y una vista ya existentes de
`001-modelo-datos-relacional` y `003-taxonomia-parametrizable` (research.md,
Decisión 1). Este documento describe la forma en la que la API expone
cada una.

## Catálogos de referencia (solo lectura)

| Tabla | Campos expuestos |
|---|---|
| `provincias` | `id`, `nombre` |
| `denominaciones_simplificadas` | `id`, `nombre` |
| `tipos_oficina` | `id`, `nombre` |
| `tipos_uf` | `id`, `nombre` |
| `fueros` | `id`, `nombre` |

Sin filtros, sin paginación (mismo criterio que `localidades`, volumen
bajo en las 5 tablas).

## Fuero de un organismo (solo lectura)

```
GET /api/organismos/:orgId/fuero →
{
  "fueros": [ { "id": number, "nombre": string } ],       -- organismo_fueros JOIN fueros
  "fueroSimplificado": string | null                       -- vista_fuero_simplificado
}
```

`fueroSimplificado` es `null` cuando `estado_fueros = 'sin_fueros_asignados'`
(la vista ya lo calcula así). Un organismo sin fueros asignados devuelve
`{ "fueros": [], "fueroSimplificado": null }` — 200, no error (FR-004).

## Asignaciones de jueces de una UF (D8)

Expone `unidad_funcional_grupo_jueces` bajo la UF (que ya vive bajo el
organismo):

```
GET    /api/organismos/:orgId/unidades-funcionales/:ufId/asignaciones-jueces
POST   /api/organismos/:orgId/unidades-funcionales/:ufId/asignaciones-jueces
PATCH  /api/organismos/:orgId/unidades-funcionales/:ufId/asignaciones-jueces/:asignacionId
DELETE /api/organismos/:orgId/unidades-funcionales/:ufId/asignaciones-jueces/:asignacionId
```

Forma de una asignación:

```json
{ "id": number, "grupoJuecesId": number, "cantidadAsignada": number }
```

`POST` body: `{ "grupoJuecesId": number, "cantidadAsignada": number }`.
`PATCH` body: `{ "cantidadAsignada": number }` — solo la cantidad es
editable; cambiar el pool de una asignación existente es borrar y crear
una nueva (mismo criterio que "reemplazo" ya usado en otras partes de
esta API, no una decisión nueva de esta feature — no hay ningún requisito
que pida editar el pool de una asignación in place).

**Reglas ya garantizadas por el esquema** (no reimplementadas, solo
traducidas a error de cliente — research.md, Decisiones 2-3):
- `(unidad_funcional_id, grupo_jueces_id)` único — FR-008.
- `cantidad_asignada > 0` — FR-009.
- `grupo_jueces_id` MUST referenciar un pool real — FK.

## Editores de un organismo

```
GET    /api/organismos/:orgId/editores
POST   /api/organismos/:orgId/editores
DELETE /api/organismos/:orgId/editores/:usuarioId
```

Forma de un editor: `{ "usuarioId": number, "nombre": string, "email": string }`
(join contra `usuarios` para que el frontend no necesite una segunda
consulta).

**Autorización distinta del resto de las subrutas de organismo**: solo
propietario o admin — un editor no puede gestionar otros editores
(research.md, Decisión 4; spec.md FR-013).

**Regla ya garantizada por el esquema**: PK compuesta
`(organismo_id, usuario_id)` — no se puede agregar dos veces al mismo
editor (Edge Case de spec.md, tratado como error identificable, no como
operación silenciosamente idempotente).

## Catálogo de preguntas de taxonomía (solo lectura, distinto de `004`)

```
GET /api/taxonomia/preguntas
GET /api/taxonomia/preguntas?tipoOficinaId=1
```

Forma de una pregunta:

```json
{
  "codigo": "autonomia", "texto": "autonomia", "grupo": "gestion",
  "tipoRespuesta": "opcion_unica",
  "opciones": [ { "codigo": "A", "etiqueta": "..." } ]
}
```

`opciones` presente (posiblemente vacío en teoría, aunque en la práctica
toda pregunta `opcion_unica`/`opcion_multiple` migrada tiene al menos 2)
solo para `tipoRespuesta` en `opcion_unica`/`opcion_multiple` — ausente
para `numerica`/`texto_libre`, misma convención que ya usa la respuesta
de `004` para consistencia entre ambos endpoints.

Sin filtro: devuelve las 9 preguntas existentes. Con
`tipoOficinaId=<id real sin preguntas aplicables>`: `[]` (FR-016). Con
`tipoOficinaId=<no existe>`: rechazo 400 (FR-017) — requiere una
validación explícita del id contra `tipos_oficina` antes de filtrar (el
`JOIN` por sí solo no distingue "tipo real sin preguntas" de "tipo que no
existe", ambos darían `[]` sin esa validación).

## Relación con el modelo existente

Ninguna tabla cambia de forma, ninguna se crea. Los 5 grupos son,
estrictamente, nuevas rutas de lectura/escritura sobre datos que
`001-modelo-datos-relacional` y `003-taxonomia-parametrizable` ya
modelaron completos.
