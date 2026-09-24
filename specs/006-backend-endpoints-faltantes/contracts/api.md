# Contrato de API: catálogos y asignaciones faltantes

Feature `006-backend-endpoints-faltantes`. Extiende
`specs/002-backend-api-carga-datos/contracts/api.md`. Convención heredada:
`401` sin sesión, sin excepción.

## Catálogos de referencia

| Método | Ruta | Autorización | FR |
|---|---|---|---|
| GET | `/api/provincias` | cualquier autenticado | FR-001 |
| GET | `/api/denominaciones-simplificadas` | cualquier autenticado | FR-001 |
| GET | `/api/tipos-oficina` | cualquier autenticado | FR-001 |
| GET | `/api/tipos-uf` | cualquier autenticado | FR-001 |
| GET | `/api/fueros` | cualquier autenticado | FR-001 |

Sin rutas de escritura (FR-002).

## Fuero de un organismo

| Método | Ruta | Autorización | FR |
|---|---|---|---|
| GET | `/api/organismos/:orgId/fuero` | idéntica al resto de las subrutas de `:orgId` (propietario, editor, o admin) | FR-003 |

- **404** si `:orgId` no existe.
- **200** con `fueros: []`, `fueroSimplificado: null` si el organismo no
  tiene ningún fuero asignado (FR-004) — nunca error.

## Asignaciones de jueces de una UF

| Método | Ruta | Autorización | FR |
|---|---|---|---|
| GET | `/api/organismos/:orgId/unidades-funcionales/:ufId/asignaciones-jueces` | idéntica a la de la UF (heredada del organismo) | FR-005 |
| POST | `/api/organismos/:orgId/unidades-funcionales/:ufId/asignaciones-jueces` | idéntica a la de la UF | FR-006/FR-007 |
| PATCH | `/api/organismos/:orgId/unidades-funcionales/:ufId/asignaciones-jueces/:asignacionId` | idéntica a la de la UF | FR-010 |
| DELETE | `/api/organismos/:orgId/unidades-funcionales/:ufId/asignaciones-jueces/:asignacionId` | idéntica a la de la UF | FR-011 |

Body de `POST`: `{ "grupoJuecesId": number, "cantidadAsignada": number }`.
Body de `PATCH`: `{ "cantidadAsignada": number }`.

- **400** `{ "error": "Ya existe una asignación de esta unidad funcional a ese pool." }`
  — `POST` con un `(ufId, grupoJuecesId)` ya asignado (FR-008).
- **400** `{ "error": "La cantidad asignada debe ser mayor a 0." }` —
  `cantidadAsignada <= 0` en `POST` o `PATCH` (FR-009).
- **400** `{ "error": "El pool de jueces indicado no existe." }` —
  `grupoJuecesId` que no existe en `POST`.
- **404** si `:orgId`, `:ufId`, o `:asignacionId` no corresponden entre
  sí o no existen.

## Editores de un organismo

| Método | Ruta | Autorización | FR |
|---|---|---|---|
| GET | `/api/organismos/:orgId/editores` | propietario, editor, o admin (misma regla de lectura que el resto del organismo) | FR-012 |
| POST | `/api/organismos/:orgId/editores` | **solo propietario o admin** — un editor no puede gestionar editores (research.md, Decisión 4) | FR-013 |
| DELETE | `/api/organismos/:orgId/editores/:usuarioId` | solo propietario o admin | FR-013 |

Body de `POST`: `{ "usuarioId": number }`.

- **400** `{ "error": "Ese usuario ya es editor de este organismo." }` —
  `POST` con un `usuarioId` ya editor.
- **400** `{ "error": "El usuario indicado no existe." }` — `usuarioId`
  que no existe.
- **403** si quien llama es editor (no propietario) y no es admin —
  distinto del resto de las subrutas de organismo, donde un editor sí
  puede.

## Catálogo de preguntas de taxonomía

| Método | Ruta | Autorización | FR |
|---|---|---|---|
| GET | `/api/taxonomia/preguntas` | cualquier autenticado | FR-014 |
| GET | `/api/taxonomia/preguntas?tipoOficinaId=<id>` | cualquier autenticado | FR-015 |

- Sin filtro: las 9 preguntas existentes.
- Con `tipoOficinaId` de un tipo real sin preguntas aplicables (`coordinación`,
  `unidad operativa`): `200`, `[]` (FR-016).
- Con `tipoOficinaId` que no corresponde a ningún tipo real: `400`
  (FR-017) — distinto del caso anterior.
