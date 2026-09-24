# Quickstart: validar los endpoints faltantes

**Feature**: 006-backend-endpoints-faltantes | **Fecha**: 2026-09-23

Guía de validación — no de implementación. Contrato completo en
[contracts/api.md](./contracts/api.md).

## Prerrequisitos

- `001`-`004` ya aplicados, backend levantando (`npm run dev`).
- Sin ninguna migración nueva que correr (research.md, Decisión 1).

## Paso 1 — Catálogos de referencia

```bash
curl -b cookies.txt http://localhost:3000/api/provincias
curl -b cookies.txt http://localhost:3000/api/tipos-oficina
curl -b cookies.txt http://localhost:3000/api/fueros
```

**Esperado**: `200`, lista completa de cada tabla, con cualquier sesión
autenticada (sin relación con ningún organismo).

## Paso 2 — Fuero de un organismo

```bash
curl -b cookies.txt http://localhost:3000/api/organismos/<id>/fuero
```

**Esperado**: `{ "fueros": [...], "fueroSimplificado": "..." }` para un
organismo con fueros cargados; `{ "fueros": [], "fueroSimplificado": null }`
para uno sin ninguno — ambos `200`.

## Paso 3 — Asignación de jueces por UF (D8)

```bash
curl -b cookies.txt -X POST http://localhost:3000/api/organismos/<orgId>/unidades-funcionales/<ufId>/asignaciones-jueces \
  -H 'Content-Type: application/json' \
  -d '{"grupoJuecesId": <poolId>, "cantidadAsignada": 3}'
```

**Esperado**: `200`/`201`, la asignación creada. Repetir con el mismo
`grupoJuecesId` → `400` "Ya existe una asignación...". Repetir con
`cantidadAsignada: 0` (otro pool) → `400` "La cantidad asignada debe ser
mayor a 0.". Crear una segunda asignación a un pool *distinto* → ambas
coexisten (`GET` de la lista las muestra a las dos).

## Paso 4 — Editores de un organismo

```bash
curl -b cookies.txt -X POST http://localhost:3000/api/organismos/<orgId>/editores \
  -H 'Content-Type: application/json' \
  -d '{"usuarioId": <otroUsuarioId>}'
```

**Esperado**: `200`/`201`; ese usuario ahora ve el organismo en
`GET /api/organismos`. Repetir el mismo `POST` → `400` "Ese usuario ya es
editor...". Intentar el mismo `POST` autenticado como ese editor (no
propietario) → `403`.

## Paso 5 — Catálogo de preguntas de taxonomía

```bash
curl -b cookies.txt "http://localhost:3000/api/taxonomia/preguntas"
curl -b cookies.txt "http://localhost:3000/api/taxonomia/preguntas?tipoOficinaId=1"
curl -b cookies.txt "http://localhost:3000/api/taxonomia/preguntas?tipoOficinaId=4"
curl -b cookies.txt "http://localhost:3000/api/taxonomia/preguntas?tipoOficinaId=999999"
```

**Esperado**: sin filtro, 9 preguntas. `tipoOficinaId=1` (oficina
judicial), 9 preguntas. `tipoOficinaId=4` (unidad operativa), `[]`.
`tipoOficinaId=999999` (no existe), `400`.

## Criterios de aceptación cubiertos

| Success Criteria | Validado en |
|---|---|
| SC-001 (catálogos legibles) | Paso 1 |
| SC-002 (fuero, con y sin datos) | Paso 2 |
| SC-003 (UF con 2+ asignaciones) | Paso 3 |
| SC-004 (rechazos identificables) | Pasos 3-4 |
| SC-005 (editores, efecto inmediato) | Paso 4 |
| SC-006 (catálogo de preguntas por tipo) | Paso 5 |
| SC-007 (005 desbloqueada) | Los 5 pasos juntos |
