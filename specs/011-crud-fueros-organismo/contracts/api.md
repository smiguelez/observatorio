# Contratos: editar los fueros de un organismo (011)

## `GET /api/organismos/:orgId/fuero` — sin cambios

Ya existe (`006`). Se documenta acá solo porque el `PUT` nuevo responde
con la misma forma exacta.

```json
{ "fueros": [{ "id": 1, "nombre": "Civil" }], "fueroSimplificado": "Civil" }
```

## `PUT /api/organismos/:orgId/fuero` — NUEVO

Reemplaza el listado completo de fueros del organismo. Autorización:
`autorizarContraOrganismoPadre` (research.md, Decisión 1) — mismo `403`/`404`
que ya da el `GET` de esta misma subruta.

**Body**:

```json
{ "fueroIds": [1, 3] }
```

- `fueroIds: number[]` — puede ser un array vacío (`[]`), que es una
  elección válida: "este organismo no asiste ningún fuero" (spec.md,
  Acceptance Scenario 3).
- Cada id MUST existir en el catálogo de fueros — un id inexistente
  responde `400` con un mensaje que lo identifica, sin escribir nada
  (mismo criterio que ya usa el `PUT` de taxonomía para preguntas/opciones
  desconocidas).

**Respuesta 200** (éxito — misma forma que el `GET`):

```json
{ "fueros": [{ "id": 1, "nombre": "Civil" }, { "id": 3, "nombre": "Laboral" }], "fueroSimplificado": "multifuero" }
```

**Respuesta 400** (FR-004 — se intentó sacar un fuero en uso por una
asignación de jueces; nada se escribió):

```json
{
  "error": "No se puede quitar el fuero «Civil»: una unidad funcional de este organismo ya tiene una asignación de jueces acotada a ese fuero.",
  "fuerosEnUso": [{ "id": 1, "nombre": "Civil" }]
}
```

**Efectos secundarios, en la misma transacción:**
- `organismos.estado_fueros` pasa a `'sin_fueros_asignados'` si `fueroIds`
  queda vacío, o a `'cargado'` en cualquier otro caso (data-model.md).
- Nunca produce `'multifuero_sin_detalle'` desde este endpoint.

## Interno, no HTTP: detector de relleno inicial

`backend/scripts/detectar-fueros-sin-poblar.ts` (research.md, Decisión 3)
— mismo patrón que `normalizar-denominaciones.ts`: dry-run por defecto
(solo lista lo que encuentra), `--aplicar` no aplica un fill automático
(no hay de dónde copiar el valor) sino que dejaría constancia explícita
de qué organismos requieren resolución manual. Hoy reporta 0 casos.
