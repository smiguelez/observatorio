# Verificación de identidad por id subrogado (US4, T030) — 20260918

Corrida contra los datos migrados en US2 (47 usuarios, 117 organismos, 80 `organismo_editores`). Script: `db/validation/identidad.sql`, ejecutado con `psql "$DATABASE_URL" -f db/validation/identidad.sql`.

## (1) `usuarios.id` es la PK real; `email` es UNIQUE citext, no PK

```sql
SELECT tc.constraint_type, kcu.column_name, c.data_type, c.udt_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu ON ...
JOIN information_schema.columns c ON ...
WHERE tc.table_name = 'usuarios' AND tc.constraint_type IN ('PRIMARY KEY', 'UNIQUE');
```

```
 constraint_type | column_name  |  data_type   | udt_name
-----------------+--------------+--------------+----------
 PRIMARY KEY     | id           | bigint       | int8
 UNIQUE          | email        | USER-DEFINED | citext
 UNIQUE          | firestore_id | text         | text
```

Confirmado: la PK es `id` (bigint). `email` no aparece como PRIMARY KEY en ningún resultado — solo como UNIQUE (citext).

## (2) 0 colisiones de email por casing en los 47 usuarios migrados

Query directa sobre los datos (no solo confiar en el `UNIQUE citext` del esquema): agrupar por `lower(email)` y listar grupos con más de un `id`.

```sql
SELECT lower(email::text), count(*), array_agg(id ORDER BY id), array_agg(email::text ORDER BY id)
FROM usuarios GROUP BY lower(email::text) HAVING count(*) > 1;
```

```
 email_normalizado | cantidad | ids | variantes_casing
-------------------+----------+-----+------------------
(0 rows)
```

Cobertura del check confirmada sobre el universo completo:

```
 total_usuarios | emails_normalizados_distintos
----------------+-------------------------------
             47 |                            47
```

47 = 47: los 47 usuarios tienen 47 valores de email normalizado distintos — el check de (0 rows) es concluyente, no un resultado vacío por accidente de agrupación parcial.

**El usuario nuevo de Misiones** (47° usuario, posterior a la auditoría 2026-09-07 que tenía 46 y no incluía Misiones — ver `docs/verificacion-datos-firestore.md:216`):

```
 id  |         email          |      firestore_id      | provincia |          creado_a
-----+------------------------+------------------------+-----------+----------------------------
 109 | fabiandreavp@gmail.com | fabiandreavp@gmail.com | Misiones  | 2026-09-16 09:49:13.026-03
```

Un solo usuario de Misiones, `id=109`, incluido en el conteo de 47/47 de arriba: no generó colisión de casing ni email duplicado.

## (3) `organismo_editores` y `organismos.propietario_id` referencian `usuarios.id`, no el email

Tipo de columna real (no el texto del contrato, la columna tal como está en la base):

```sql
SELECT table_name, column_name, data_type, udt_name FROM information_schema.columns
WHERE (table_name='organismos' AND column_name='propietario_id')
   OR (table_name='organismo_editores' AND column_name='usuario_id')
   OR (table_name='usuarios' AND column_name='id');
```

```
     table_name     |  column_name   | data_type | udt_name
--------------------+----------------+-----------+----------
 organismo_editores | usuario_id     | bigint    | int8
 organismos         | propietario_id | bigint    | int8
 usuarios           | id             | bigint    | int8
```

Mismo tipo (`bigint`/`int8`) en las tres columnas — `propietario_id` y `usuario_id` no son `text`/`citext`, son FK numéricas al mismo dominio que `usuarios.id`.

Cobertura real de la resolución por id (no solo el tipo de columna: el join efectivamente resuelve al 100%):

```
 total_organismos | con_propietario_id | propietario_id_resuelto_por_id
------------------+---------------------+--------------------------------
              117 |                 117 |                            117
```

```
 total_organismo_editores | usuario_id_resuelto_por_id
--------------------------+----------------------------
                        80 |                         80
```

117/117 organismos con `propietario_id` no nulo y resuelto por join a `usuarios.id`; 80/80 filas de `organismo_editores` resueltas por `usuario_id` → `usuarios.id`. Coincide con los conteos reconciliados de US2 (organismos=117, organismo_editores=80).

## Chequeo adicional: 0 emails duplicados literales

```sql
SELECT email, count(*) FROM usuarios GROUP BY email HAVING count(*) > 1;
```

```
 email | count
-------+-------
(0 rows)
```

## Resumen

| Verificación pedida | Resultado |
|---|---|
| `usuarios.id` es la PK real (bigint), no email | PK = `id` (bigint); `email` es UNIQUE citext, no PK |
| 0 colisiones de email por casing en los 47 usuarios | 0 filas en `GROUP BY lower(email) HAVING count(*)>1`; 47 usuarios = 47 emails normalizados distintos; usuario de Misiones (`id=109`) incluido sin romper el conteo |
| `organismo_editores`/`organismos.propietario_id` referencian `usuarios.id`, no email | Ambas columnas son `bigint`, igual tipo que `usuarios.id`; 117/117 y 80/80 resueltas por join a `usuarios.id` |
