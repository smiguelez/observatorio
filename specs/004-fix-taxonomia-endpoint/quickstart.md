# Quickstart: validar el endpoint de taxonomía reconstruido

**Feature**: 004-fix-taxonomia-endpoint | **Fecha**: 2026-09-22

Guía de validación — no de implementación. Contrato completo en
[contracts/api.md](./contracts/api.md); DDL de la Protección A en
[contracts/migration-0003-taxonomia-tipo-organismo.sql](./contracts/migration-0003-taxonomia-tipo-organismo.sql)
(ya probado con dry run `BEGIN/ROLLBACK` contra la base real, incluyendo
control positivo y negativo — ver research.md).

## Prerrequisitos

- `001`, `002` y `003` ya aplicados (`public.*` + `auth.*` migrados,
  backend levantando).
- `DATABASE_URL`, `BETTER_AUTH_SECRET` y credenciales de Google cargadas
  (Principio XIII) — mismas que `002`.

## Paso 1 — Aplicar la migración `0003`

```bash
cd backend
npx tsx scripts/migrate-public.ts
```

**Esperado**: `"0003_taxonomia_tipo_organismo" ejecutada correctamente`.
Verificar que `public.*` sigue con las mismas 23 tablas de `003` (esta
migración solo agrega funciones + 1 trigger, ninguna tabla) y que el
organismo id=311 sigue con la misma cantidad de respuestas que antes
(`SELECT count(*) FROM evaluaciones_taxonomicas WHERE organismo_id = 311`).

## Paso 2 — `GET` de un organismo con taxonomía migrada (SC-001)

```bash
curl -b cookies.txt http://localhost:3000/api/organismos/<id-de-uno-de-los-89>/taxonomia
```

**Esperado**: array de 9 entradas, cada una con `pregunta.codigo`,
`pregunta.texto`, `pregunta.tipoRespuesta: "opcion_unica"`, y `opciones`
con 1 elemento.

## Paso 3 — `GET` de un organismo sin taxonomía (FR-003)

```bash
curl -b cookies.txt http://localhost:3000/api/organismos/<id-sin-evaluacion>/taxonomia
```

**Esperado**: **200** con `[]` — no un error.

## Paso 4 — Reemplazo válido, incluida una pregunta de opción múltiple (SC-002)

Requiere una pregunta `opcion_multiple` de prueba (ninguna de las 9
migradas lo es — crearla vía `psql` primero, como en
`003-taxonomia-parametrizable`, T016).

```bash
curl -b cookies.txt -X PUT http://localhost:3000/api/organismos/<id>/taxonomia \
  -H 'Content-Type: application/json' \
  -d '{"respuestas":[{"preguntaCodigo":"autonomia","opcionesCodigos":["B"]},{"preguntaCodigo":"<codigo-multiple>","opcionesCodigos":["X","Y"]}]}'
```

**Esperado**: **200**; un `GET` posterior devuelve exactamente esas
entradas — el resto de las 8 preguntas que no se reenviaron ya no
aparecen (FR-007).

## Paso 5 — Rechazo por integridad, error identificable (SC-003)

```bash
curl -b cookies.txt -X PUT http://localhost:3000/api/organismos/<id>/taxonomia \
  -H 'Content-Type: application/json' \
  -d '{"respuestas":[{"preguntaCodigo":"autonomia","opcionesCodigos":["<codigo-de-opcion-de-otra-pregunta>"]}]}'
```

**Esperado**: **400**, `{ "error": "...pertenece a la pregunta...(FR-007)" }`
— nunca un 500. Un `GET` posterior confirma que la taxonomía del
organismo no cambió.

## Paso 6 — Protección A: escritura nueva para una pregunta que no aplica al tipo (SC-006)

```bash
# organismo real de tipo 'unidad operativa' (tipo_oficina_id=4)
curl -b cookies.txt -X PUT http://localhost:3000/api/organismos/<id-unidad-operativa>/taxonomia \
  -H 'Content-Type: application/json' \
  -d '{"respuestas":[{"preguntaCodigo":"autonomia","opcionesCodigos":["A"]}]}'
```

**Esperado**: **400**, `{ "error": "...no aplica al tipo de organismo actual...(Protección A)" }`.
Confirmar aparte, por consulta directa, que el organismo id=311 (caso
histórico) sigue con sus respuestas intactas — esta protección no lo toca
(`SELECT count(*) FROM evaluaciones_taxonomicas WHERE organismo_id = 311`,
debe seguir dando el mismo número que antes del Paso 1).

## Paso 7 — Protección B: aviso sin confirmación (SC-007)

```bash
# organismo con taxonomía cargada para preguntas que no aplican al tipo nuevo
curl -b cookies.txt -X PATCH http://localhost:3000/api/organismos/<id> \
  -H 'Content-Type: application/json' \
  -d '{"tipoOficinaId": 4}'
```

**Esperado**: **400**, con `preguntasQueSePerderian` listando las
preguntas/respuestas afectadas. El tipo del organismo NO cambia
(`GET /api/organismos/:id` posterior lo confirma).

## Paso 8 — Protección B: confirmado (SC-008)

```bash
curl -b cookies.txt -X PATCH http://localhost:3000/api/organismos/<id> \
  -H 'Content-Type: application/json' \
  -d '{"tipoOficinaId": 4, "confirmarPerdidaTaxonomia": true}'
```

**Esperado**: **200**, el tipo cambia; un `GET` de la taxonomía del
organismo ya no incluye las preguntas que dejaron de aplicar — el resto
(si las hubiera) sigue intacto.

## Paso 9 — Protección B: sin pérdida, sin aviso (SC-009)

```bash
# organismo sin ninguna taxonomía cargada
curl -b cookies.txt -X PATCH http://localhost:3000/api/organismos/<id-sin-taxonomia> \
  -H 'Content-Type: application/json' \
  -d '{"tipoOficinaId": 4}'
```

**Esperado**: **200** de inmediato, sin ningún error ni campo de
confirmación exigido.

## Criterios de aceptación cubiertos

| Success Criteria | Validado en |
|---|---|
| SC-001 (consulta sin error de servidor) | Paso 2, 3 |
| SC-002 (reemplazo exacto, incluida opción múltiple) | Paso 4 |
| SC-003 (rechazo identificable, taxonomía previa intacta) | Paso 5 |
| SC-004 (0% error de servidor genérico) | Pasos 5-7 (siempre 400, nunca 500) |
| SC-005 (cobertura de test automatizada) | `backend/tests/contract/taxonomia.test.ts` |
| SC-006 (Protección A, sin afectar id=311) | Paso 6 |
| SC-007 (Protección B, bloqueo con listado) | Paso 7 |
| SC-008 (Protección B, confirmado, borrado exacto) | Paso 8 |
| SC-009 (Protección B, sin pérdida, sin aviso) | Paso 9 |
