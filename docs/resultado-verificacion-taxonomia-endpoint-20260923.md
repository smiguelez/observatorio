# Verificación de punta a punta — Endpoint de taxonomía reconstruido (T021, T022)

Feature `004-fix-taxonomia-endpoint`. Corrida contra la base real
(`observatorio`) y el backend real levantado (`npm run dev`, puerto 3011),
con `001`/`002`/`003` y las migraciones `0001`-`0003` de `public.*` ya
aplicadas.

## T021 — `quickstart.md` de punta a punta (Pasos 1-9), contra HTTP real

No se usó `app.inject` (in-process) para esta corrida — se levantó el
servidor real y se lo golpeó con `curl` y una sesión real (`sign-up` +
cookie), para probar el mismo camino que un cliente real usaría.

**Paso 1** — `npx tsx scripts/migrate-public.ts`:
```
[migrate:public] Nada que migrar — public.* ya está al día.
```

**Paso 2-3** — `GET` de un organismo con taxonomía migrada (id=237) y de
uno nuevo sin evaluación (id=578, creado para esta corrida):
```
GET /api/organismos/237/taxonomia → 200, 9 entradas (verificado por conteo)
GET /api/organismos/578/taxonomia → 200, []
```

**Paso 4** — `PUT` válido, incluida una pregunta `opcion_multiple` de
prueba (`quickstart_004_multiple`, 2 opciones):
```
PUT → 200, devuelve 2 entradas (autonomia + la multiple con [X,Y])
GET posterior → exactamente igual
```

**Paso 5** — rechazo por integridad (opción inexistente):
```
PUT { autonomia: [NO-EXISTE] } → 400
{"error":"evaluaciones_taxonomicas: la pregunta 5 es opcion_unica — la
respuesta debe traer opcion_id y nada más (FR-004/FR-008)"}
GET posterior → sin cambios (las 2 entradas del Paso 4 siguen iguales)
```

**Paso 6** — Protección A, organismo real de tipo `unidad operativa`
(id=579, creado para esta corrida):
```
PUT { autonomia: [A] } → 400
{"error":"evaluaciones_taxonomicas: la pregunta 5 no aplica al tipo de
organismo actual (tipo_oficina_id=4) del organismo 579 (Protección A)"}
```
Confirmado en el mismo paso: `SELECT count(*) FROM evaluaciones_taxonomicas
WHERE organismo_id = 311` → **9** (sin cambios).

**Paso 7** — Protección B sin confirmación:
```
PATCH /api/organismos/578 { tipoOficinaId: 4 } → 400
{"error":"El cambio de tipo dejaría sin aplicar 2 respuesta(s) de
taxonomía","preguntasQueSePerderian":[{"codigo":"autonomia",...},
{"codigo":"quickstart_004_multiple",...}]}
GET /api/organismos/578 → tipo_oficina_id: 1 (sin cambiar)
```

**Paso 8** — Protección B confirmada:
```
PATCH /api/organismos/578 { tipoOficinaId: 4, confirmarPerdidaTaxonomia: true } → 200
GET /api/organismos/578 → tipo_oficina_id: 4
GET /api/organismos/578/taxonomia → [] (las 2 respuestas huérfanas eliminadas)
```

**Paso 9** — sin pérdida, sin aviso (organismo 579, sin ninguna taxonomía
cargada):
```
PATCH /api/organismos/579 { tipoOficinaId: 1 } → 200 inmediato
```

**Limpieza**: organismos 578/579, la pregunta de prueba, y el usuario de
esta corrida eliminados al terminar. Confirmado por consulta directa:
`organismos WHERE id IN (578,579)` → 0, `usuarios WHERE id = 805` → 0,
`evaluaciones_taxonomicas WHERE organismo_id = 311` → **9** (intacto).

## Suite automatizada

```
Test Files  14 passed (14)
     Tests  73 passed (73)
```
Corrida dos veces seguidas, mismo resultado ambas — sin regresiones de
`002`/`003`. `taxonomia.test.ts` (11 casos, US1-US4), `organismos-cambio-tipo.test.ts`
(3 casos, US5).

## T022 — Success Criteria de `spec.md`, una por una

- **SC-001** (consulta sin error de servidor): ✅ `GET` 237 (200, 9), 578
  antes de tener datos (200, []) — Paso 2-3.
- **SC-002** (reemplazo exacto): ✅ Paso 4, PUT+GET idénticos.
- **SC-003** (rechazo identificable, taxonomía previa intacta): ✅ Paso 5;
  también `taxonomia.test.ts`, 3 casos (opción de otra pregunta,
  duplicado, forma equivocada).
- **SC-004** (0% error de servidor genérico): ✅ todo rechazo observado en
  esta corrida y en la suite completa fue 400, nunca 500.
- **SC-005** (cobertura de test automatizada): ✅ `taxonomia.test.ts` (11
  casos) + `organismos-cambio-tipo.test.ts` (3 casos) — no existía
  ninguna antes de esta feature (D11).
- **SC-006** (Protección A, sin afectar id=311): ✅ Paso 6; confirmado
  también a nivel de esquema (`db/validation/taxonomia_tipo_organismo.sql`,
  3/3) y a nivel de endpoint (`taxonomia.test.ts`), con el conteo de
  id=311 verificado en cada uno de los tres niveles.
- **SC-007** (Protección B, bloqueo con listado): ✅ Paso 7; también
  `organismos-cambio-tipo.test.ts`.
- **SC-008** (Protección B, confirmado, borrado exacto): ✅ Paso 8 — las
  2 respuestas que dejaron de aplicar desaparecieron, ninguna otra se vio
  afectada (no había otra).
- **SC-009** (Protección B, sin pérdida, sin aviso): ✅ Paso 9.

## Confirmación final — organismo id=311 (OGA MEDIACIÓN)

El caso que originó esta feature. Verificado explícitamente en cada
checkpoint de US4 y US5, y una vez más acá, al cierre de toda la
implementación:

```sql
SELECT count(*) FROM evaluaciones_taxonomicas WHERE organismo_id = 311;
-- 9
SELECT tipo_oficina_id FROM organismos WHERE id = 311;
-- 4 (sin cambios respecto del inicio de la feature)
```

Ninguna de las dos protecciones nuevas lo tocó — ni debían: ambas son
estrictamente hacia adelante, tal como especifica `spec.md`.
