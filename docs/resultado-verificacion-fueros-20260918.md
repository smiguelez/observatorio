# Verificación de fuero_simplificado y estado_fueros (US5, T032) — 20260918

Corrida contra los 117 organismos migrados en US2 (reconciliados `97/97` en `organismo_fueros`). Script: `db/validation/fueros.sql`, ejecutado con `psql "$DATABASE_URL" -f db/validation/fueros.sql`.

## (1) `vista_fuero_simplificado` — solo los 5 valores esperados, para los 117 organismos

```sql
SELECT fuero_simplificado, count(*) FROM vista_fuero_simplificado GROUP BY fuero_simplificado;
```

```
 fuero_simplificado | cantidad
--------------------+----------
 civil              |       31
 familia            |       11
 laboral            |       13
 multifuero         |       20
 penal              |       42
```

Suma: 31+11+13+20+42 = **117** (= total de organismos).

```sql
SELECT count(*) FROM vista_fuero_simplificado;                         -- 117
SELECT fuero_simplificado, count(*) FROM vista_fuero_simplificado
  WHERE fuero_simplificado IS NULL
     OR fuero_simplificado NOT IN ('penal','civil','laboral','familia','multifuero')
  GROUP BY fuero_simplificado;                                          -- 0 filas
```

`total_filas_vista = 117` y **0 filas** con valor `NULL` o fuera del conjunto esperado. Confirma "sin ningún valor inesperado" sobre el universo completo, no una muestra.

Comparado contra la auditoría de origen (`docs/resultado-verificacion-fueros-20260907.md`, 116 organismos): civil=31, familia=11, laboral=13, multifuero=20 se mantienen exactos; penal pasó de 41→42, coincide con el alta del organismo de Misiones (ver punto 3) que es `penal`.

## (2) Distribución real de `estado_fueros` (enum) sobre los 117 organismos

```sql
SELECT estado_fueros, count(*) FROM organismos GROUP BY estado_fueros;
```

```
     estado_fueros      | cantidad
------------------------+----------
 cargado                |       97
 multifuero_sin_detalle |       20
```

`sin_fueros_asignados` no aparece en la distribución (0 filas), 97+20 = 117.

## (3) Organismo nuevo de Misiones — valor coherente en la vista

Ubicado por `propietario_id = 109` (el usuario de Misiones confirmado en T030):

```sql
SELECT o.id, o.denominacion, o.firestore_id, o.estado_fueros, v.fuero_simplificado,
       (SELECT array_agg(f.nombre) FROM organismo_fueros ofu JOIN fueros f ON f.id=ofu.fuero_id
        WHERE ofu.organismo_id = o.id) AS fueros_concretos_cargados
FROM organismos o JOIN vista_fuero_simplificado v ON v.organismo_id = o.id
WHERE o.propietario_id = 109;
```

```
 id  |      denominacion       |     firestore_id     | estado_fueros | fuero_simplificado | fueros_concretos_cargados
-----+-------------------------+----------------------+---------------+--------------------+---------------------------
 242 | Poder Judicial Misiones | 4VHEx6z0tGB7xUa9yUFP | cargado       | penal              | {penal}
```

Coherente: `estado_fueros='cargado'` + exactamente 1 fuero concreto (`penal`) cargado en `organismo_fueros` → la vista deriva `fuero_simplificado='penal'`, no `multifuero` ni `NULL`. Es el organismo que explica el 41→42 de `penal` en (1).

## (4) Estados de migración D3: `sin_fueros_asignados` y `multifuero_sin_detalle`

**0 casos reales de `sin_fueros_asignados`:**

```sql
SELECT count(*) FROM organismos WHERE estado_fueros = 'sin_fueros_asignados';   -- 0
```

**`multifuero_sin_detalle` = 20** (no 21: el alta de Misiones fue `cargado`/`penal`, no multifuero — igual que en (1), la cuenta de `multifuero` no cambió respecto al 2026-09-07):

```sql
SELECT count(*) FROM organismos WHERE estado_fueros = 'multifuero_sin_detalle';  -- 20
```

Cruce: confirmar que esos 20 organismos son justamente los que **no** tienen fueros concretos desglosados en `organismo_fueros` (coherente con "sin_detalle" — el estado se preserva sin desglose, D3):

```sql
SELECT o.estado_fueros, count(DISTINCT o.id) AS organismos, count(ofu.fuero_id) AS fueros_concretos_cargados
FROM organismos o LEFT JOIN organismo_fueros ofu ON ofu.organismo_id = o.id
WHERE o.estado_fueros = 'multifuero_sin_detalle' GROUP BY o.estado_fueros;
```

```
     estado_fueros      | organismos | fueros_concretos_cargados
------------------------+------------+---------------------------
 multifuero_sin_detalle |         20 |                         0
```

20 organismos, **0** fueros concretos cargados entre todos ellos — confirma que "sin_detalle" efectivamente no tiene fueros desglosados (si tuviera >0 acá, algo se cargó mal).

Cruce inverso, para los 97 `cargado` (deben tener exactamente 1 fuero concreto cada uno, o la vista devolvería `multifuero` en vez del nombre del fuero):

```sql
SELECT count(*) AS organismos_cargado, count(*) FILTER (WHERE cantidad_fueros=1) AS con_exactamente_1,
       count(*) FILTER (WHERE cantidad_fueros<>1) AS con_cantidad_distinta_de_1
FROM (SELECT o.id, count(ofu.fuero_id) AS cantidad_fueros FROM organismos o
      LEFT JOIN organismo_fueros ofu ON ofu.organismo_id=o.id
      WHERE o.estado_fueros='cargado' GROUP BY o.id) x;
```

```
 organismos_cargado | con_exactamente_1_fuero | con_cantidad_distinta_de_1
---------------------+-------------------------+----------------------------
                  97 |                       97 |                          0
```

97/97 con exactamente 1 fuero concreto, 0 con cantidad distinta de 1.

## Resumen

| Verificación pedida | Resultado |
|---|---|
| Vista devuelve solo los 5 valores esperados para los 117 organismos | 117 filas; distribución civil=31/familia=11/laboral=13/multifuero=20/penal=42 (suma 117); 0 filas con `NULL` u otro valor |
| Organismo nuevo de Misiones coherente en la vista | `id=242`, `estado_fueros='cargado'`, 1 fuero concreto (`penal`) → vista devuelve `penal` |
| 0 `sin_fueros_asignados` reales | `count=0` |
| `multifuero_sin_detalle` = 20 (no 21; el alta fue `cargado`) | `count=20`; cruce confirma 0 fueros concretos cargados en esos 20; los 97 `cargado` tienen exactamente 1 fuero cada uno |
