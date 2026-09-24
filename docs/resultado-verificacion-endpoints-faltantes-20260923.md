# Verificación de punta a punta — Endpoints faltantes (T017, T018)

Feature `006-backend-endpoints-faltantes`. Corrida contra la base real
(`observatorio`) y el backend real levantado (`npm run dev`, puerto
3012), con `001`-`004` y las migraciones `0001`-`0003` ya aplicadas. Sin
ninguna migración nueva (research.md, Decisión 1).

## T017 — `quickstart.md` de punta a punta (Pasos 1-5), contra HTTP real

Sesión real (`sign-up` + cookie), sin `app.inject` — mismo criterio que
`004`.

**Paso 1 — catálogos**:
```
provincias: 24, HTTP 200
tipos-oficina: 4, HTTP 200
fueros: 4, HTTP 200
tipos-uf: 3, HTTP 200
denominaciones-simplificadas: 10, HTTP 200
```

**Paso 2 — fuero** (organismo real id=237):
```
GET /api/organismos/237/fuero → 200
{"fueros":[{"id":3,"nombre":"familia"}],"fueroSimplificado":"familia"}
```

**Paso 3 — asignaciones de jueces** (UF real id=559 del organismo 237),
los tres rechazos:
```
POST { grupoJuecesId: 312, cantidadAsignada: 4 } → 201
POST (mismo pool de nuevo) → 400 "Ya existe una asignación de esta unidad funcional a ese pool."
POST (cantidadAsignada: 0) → 400 "La cantidad asignada debe ser mayor a 0."
POST (grupoJuecesId: 999999999) → 400 "El pool de jueces indicado no existe."
```
Asignación de prueba eliminada al terminar.

**Paso 4 — editores** (organismo propio nuevo, id=724; usuario real
"Amelia Farfan", id=97):
```
POST { usuarioId: 97 } → 201
GET → [{"usuarioId":"97","nombre":"Amelia Farfan","email":"ameliafarfan892@gmail.com"}]
POST (mismo usuario de nuevo) → 400 "Ese usuario ya es editor de este organismo."
POST { usuarioId: 999999999 } → 400 "El usuario indicado no existe."
```

**Paso 5 — catálogo de preguntas**:
```
sin filtro: 9
tipoOficinaId=1 (oficina judicial): 9
tipoOficinaId=4 (unidad operativa): []
tipoOficinaId=999999: 400 "tipoOficinaId 999999 no corresponde a ningún tipo de organismo real"
```

**Limpieza**: organismo 724, usuario de la corrida, asignación de prueba —
todos eliminados. Confirmado por consulta directa: `organismos WHERE
id=724` → 0, `usuarios WHERE id=1138` → 0. Datos reales sin tocar:
`evaluaciones_taxonomicas WHERE organismo_id=311` → 9 (intacto, feature
`004`), `organismo_fueros WHERE organismo_id=237` → 1 (intacto).

## Suite automatizada

```
Test Files  19 passed (19)
     Tests  105 passed (105)
```
Corrida dos veces seguidas al cierre, mismo resultado ambas.

**Hallazgos reales encontrados durante la implementación** (no solo
diseño en papel):
- Fixture de test con `localidadId: 1` hardcodeado (no existe en datos
  migrados) — mismo bug ya visto en `002`, corregido consultando una
  localidad real.
- `usuarioId` viaja como string en el JSON (bigint de Postgres, mismo
  criterio que el resto de la API) — el test asumía number, corregido.
- `tipos_oficina.id` es `smallint`: un `tipoOficinaId` fuera de rango
  (999999) hacía explotar la consulta con un error de Postgres (500)
  antes de llegar al chequeo de "no existe" — corregido validando el
  rango antes de consultar.

## T018 — Success Criteria de `spec.md`, una por una

- **SC-001** (catálogos legibles): ✅ Paso 1, los 5 catálogos con datos
  reales.
- **SC-002** (fuero, con datos): ✅ Paso 2; el caso "sin fuero" ya se
  verificó en el checkpoint de US2 (`organismo-fuero.test.ts`).
- **SC-003** (2+ asignaciones a pools distintos): ✅ verificado en el
  checkpoint de US3 (`asignaciones-jueces.test.ts`); Paso 3 de esta
  corrida verificó los rechazos sobre datos reales.
- **SC-004** (rechazos identificables, nunca 500): ✅ los 3 tipos de
  rechazo (duplicado, cantidad, FK) — Paso 3, ninguno devolvió 500 ni acá
  ni en la suite automatizada.
- **SC-005** (editores, efecto inmediato): ✅ Paso 4, más el checkpoint
  de US4 que verificó el efecto en `GET /api/organismos` del usuario
  agregado/quitado.
- **SC-006** (catálogo de preguntas por tipo): ✅ Paso 5.
- **SC-007** (`005` desbloqueada): ✅ los 5 grupos de datos que
  `005-frontend-cliente` necesitaba y no tenía están ahora disponibles
  por API, verificados contra datos reales en cada uno de los 5 pasos.

## Confirmación final — datos reales sin alterar

```sql
SELECT count(*) FROM evaluaciones_taxonomicas WHERE organismo_id = 311;  -- 9
SELECT count(*) FROM organismo_fueros WHERE organismo_id = 237;          -- 1
```

Ningún dato real de organismos existentes (237, 311, ni ningún otro) fue
modificado por esta corrida — todas las escrituras de la verificación se
hicieron sobre entidades creadas para la ocasión y eliminadas al cierre.
