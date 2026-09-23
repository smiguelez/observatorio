# Contrato de API: taxonomía de organismos

Feature `004-fix-taxonomia-endpoint`. Extiende
`specs/002-backend-api-carga-datos/contracts/api.md` — no lo reemplaza.
Autorización en los tres endpoints: `esOwnerOEditor()` del organismo, o
admin (misma función ya usada por `unidades_funcionales`, sin variante
propia — spec.md FR-012).

## `GET /api/organismos/:orgId/taxonomia`

**200** — array (posiblemente vacío) de respuestas agrupadas por pregunta:

```json
[
  {
    "pregunta": { "codigo": "autonomia", "texto": "autonomia", "grupo": "gestion", "tipoRespuesta": "opcion_unica" },
    "opciones": [{ "codigo": "A", "etiqueta": "..." }]
  },
  {
    "pregunta": { "codigo": "prueba_numerica", "texto": "...", "grupo": "gestion", "tipoRespuesta": "numerica" },
    "valorNumero": 42
  }
]
```

- **404** `{ "error": "Organismo no encontrado" }` — `:orgId` no existe.
- **403** `{ "error": "No autorizado" }` — sin ser dueño/editor/admin.
- **401** — sin sesión (hook global ya existente, sin cambios).
- Un organismo sin ninguna evaluación cargada devuelve **200** con `[]` —
  nunca 404 por "sin datos" (spec.md FR-003; distinto del 404 de `:orgId`
  inexistente).

## `PUT /api/organismos/:orgId/taxonomia`

Body:

```json
{ "respuestas": [
  { "preguntaCodigo": "autonomia", "opcionesCodigos": ["A"] },
  { "preguntaCodigo": "prueba_numerica", "valorNumero": 42 },
  { "preguntaCodigo": "prueba_texto", "valorTexto": "..." }
] }
```

- **200** — devuelve la taxonomía resultante, misma forma que el `GET`.
- **400** `{ "error": "<mensaje del trigger>" }` — el conjunto enviado
  viola una regla de integridad (opción de otra pregunta, forma
  equivocada para el tipo de la pregunta, más de una respuesta para una
  pregunta no-múltiple, pregunta que no aplica al tipo del organismo —
  Protección A) o referencia un `preguntaCodigo`/código de opción
  inexistente. La taxonomía previa del organismo queda intacta (FR-011).
- **404**/**403**/**401** — igual que `GET`.
- `respuestas: []` es válido — borra toda la taxonomía del organismo
  (FR-008).

## `PATCH /api/organismos/:id` (extensión — Protección B)

Sin cambios en los campos ya existentes de `002-backend-api-carga-datos`.
Campo nuevo, opcional:

```json
{ "tipoOficinaId": 4, "confirmarPerdidaTaxonomia": true }
```

Comportamiento nuevo, **solo cuando el body incluya `tipoOficinaId`
distinto del actual**:

- Si el organismo tiene respuestas cargadas para preguntas que no aplican
  al `tipoOficinaId` nuevo, y `confirmarPerdidaTaxonomia` no es `true`:
  **400**
  ```json
  { "error": "El cambio de tipo dejaría sin aplicar 2 respuesta(s) de taxonomía",
    "preguntasQueSePerderian": [
      { "codigo": "autonomia", "texto": "autonomia" },
      { "codigo": "dependencia", "texto": "dependencia" }
    ] }
  ```
  El tipo **no** cambia.
- Con `confirmarPerdidaTaxonomia: true`: **200**, el tipo cambia y esas
  respuestas se eliminan, en la misma transacción. Sin registro de lo
  eliminado (spec.md, decisión explícita de no versionar/archivar).
- Si ninguna respuesta queda huérfana (incluido un organismo sin ninguna
  taxonomía cargada, o un tipo nuevo cuyas preguntas aplicables incluyen a
  todas las del tipo actual): **200**, el cambio procede sin exigir
  `confirmarPerdidaTaxonomia`, aunque el cliente lo haya mandado en `true`
  igual (no es un error mandarlo de más).
- Cualquier otro campo del body (`denominacion`, etc.) se comporta
  exactamente igual que hoy — sin cambios.
