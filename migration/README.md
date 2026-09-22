# Herramienta de migración Firestore → PostgreSQL

Feature `001-modelo-datos-relacional`. Migra el dominio actual (Firestore) al
modelo relacional (`db/schema.sql`) con reconciliación por entidad y cero
pérdida (Principio X).

> **Esta herramienta es de un solo uso.** No es un servicio, no corre en
> cron, no tiene modo incremental. Se escribió para migrar **una vez**,
> se corrió como prueba contra un snapshot (2026-09-16/18) para validar el
> modelo y el propio proceso, y se volverá a correr **una sola vez más**, en
> el corte real a producción. No está pensada para reutilizarse en el día a
> día del observatorio ni para sincronizar datos de forma recurrente. El
> proceso completo del corte real —congelar el origen, export fresco, cuándo
> encender la app nueva— está en
> [`docs/runbook-corte-produccion.md`](../docs/runbook-corte-produccion.md);
> este documento cubre solo cómo correr el código.

## Requisitos

- Node.js 20 LTS.
- Un rol de PostgreSQL 17 con permiso de escritura sobre el esquema ya
  aplicado (ver `db/schema.sql`).

## Variables de entorno

Nada hardcodeado (Principio XIII): toda credencial/ruta viene de variables de
entorno, cargadas por `migration/config/env.js`.

**Destino (Postgres) — una de las dos formas:**

| Variable | Uso |
|---|---|
| `DATABASE_URL` | connection string completa (`postgresql://user:pass@host:port/db`). Si está seteada, tiene prioridad. |
| `PGHOST`, `PGPORT` (default 5432), `PGDATABASE`, `PGUSER`, `PGPASSWORD` | alternativa campo por campo si no se usa `DATABASE_URL`. |

**Origen (Firestore) — una de las dos formas, mutuamente excluyentes:**

| Variable | Uso |
|---|---|
| `FIRESTORE_SNAPSHOT_PATH` | ruta a un export JSON ya tomado (respaldo de solo lectura). Si está seteada, la extracción lee del snapshot y **no** toca Firestore en vivo. Es la que se usó en la corrida de prueba. |
| `GOOGLE_APPLICATION_CREDENTIALS` (+ opcional `FIRESTORE_PROJECT_ID`) | credenciales de service account para leer Firestore en vivo. Requerida para el corte real (export fresco — ver runbook). |

`loadSourceConfig()` (`migration/config/env.js`) revisa `FIRESTORE_SNAPSHOT_PATH`
primero; si no está, exige `GOOGLE_APPLICATION_CREDENTIALS`. Ambas rutas son
de **solo lectura** por diseño: el pipeline nunca escribe en Firestore
(FR-033, SC-009).

## Cómo ejecutarla

```bash
cd migration
npm install
DATABASE_URL="postgresql://..." \
FIRESTORE_SNAPSHOT_PATH="/ruta/al/export.json" \
  node run.js
```

(o `GOOGLE_APPLICATION_CREDENTIALS=...` en vez de `FIRESTORE_SNAPSHOT_PATH`
para leer Firestore en vivo). Precondición: el esquema ya debe estar aplicado
y las semillas de catálogos cargadas (`db/schema.sql` + `db/seeds/`;
`quickstart.md` Pasos 1-2) — el pipeline no crea el esquema, solo migra datos.

Salida: `Migración completa. Resumen: {...}` y exit code `0` si todo
reconcilió; `Migración detenida (halt): <mensaje>` y exit code `1` si algo
falló o quedó en discrepancia.

## Qué hace cada fase

Cuatro capas, una carpeta por fase (`migration/src/{extract,transform,load,reconcile}/`):

- **`extract/`** — lee del origen (Firestore en vivo o snapshot JSON, vía
  `extract/source.js`, que abstrae cuál de los dos usar) por colección:
  `usuarios` (`users`), `localidades`, `grupos_jueces` (`pools_jueces`),
  `organismos`, `unidades_funcionales`, `evaluaciones_taxonomicas`
  (subcolección `taxonomia/v1`).
- **`transform/`** — convierte cada documento al shape de su tabla destino:
  resuelve nombres de catálogo, canonicaliza tipos divergentes (FR-027:
  `actualizado_a` string→timestamp, `anio_implementacion`→año numérico,
  `email`→minúscula), y aplica las correcciones puntuales de anomalías
  conocidas (ver sección siguiente).
- **`load/`** — inserta en PostgreSQL resolviendo FK por `firestore_id → id`
  subrogado (`load/pg-client.js#resolveIdByFirestoreId` /
  `buildFirestoreIdMap` para catálogos y entidades ya cargadas), y llama a
  `reconcileEntity` por cada entidad que carga.
- **`reconcile/`** — `reconcile.js` compara conteo de origen vs. destino por
  entidad, persiste el resultado en `migracion_reconciliacion`
  (`contracts/reconciliacion-log.schema.json`) y lanza
  `DiscrepanciaAbiertaError` si no coinciden (FR-031/032/034).
  `orchestrator.js` (`runMigration`) invoca todo en el orden FK-seguro.

## Orden de carga (`orchestrator.js`)

```
usuarios (+ usuario_roles)
  → localidades, grupos_jueces (pools)
    → organismos (+ organismo_editores, + organismo_fueros)
      → unidades_funcionales
        → unidad_funcional_grupo_jueces (asignaciones de jueces, D8)
          → evaluaciones_taxonomicas
```

`usuario_roles` se resuelve dentro de `load/usuarios.js` (no en un archivo
separado); `organismo_editores` y `organismo_fueros` dentro de
`load/organismos.js`, por la misma razón (ambos dependen de datos que ya
trae el documento de `organismos`, no de una colección propia).

## Comportamiento de halt / reanudación

Todo `runMigration()` corre dentro de **una única transacción SQL**
(`BEGIN` al inicio, `COMMIT` solo si las nueve entidades reconciliaron
`coincide`). No hay checkpoint intermedio ni carga parcial persistida:

- Si una entidad reconcilia con discrepancia (`conteo_origen ≠
  conteo_destino`), o si cualquier `transform`/`load` lanza una excepción
  (dato inesperado, FK sin resolver, código fuera de catálogo no cubierto),
  el orquestador hace `ROLLBACK` de **toda** la transacción — no queda nada
  a medio migrar en la base.
- "Reanudar" significa **corregir la causa y volver a correr `node run.js`
  desde cero**, no continuar desde donde se cortó. No hay estado de progreso
  entre corridas: cada corrida es atómica (todo o nada), por diseño
  (Principio X — "corrió sin error" no es evidencia de completitud si quedó
  algo a medias).
- El log de `migracion_reconciliacion` **si** persiste entre corridas (no se
  borra), así que corridas sucesivas acumulan filas; para auditar una
  corrida puntual, filtrar por `corrida_a`.

## Respaldo de solo lectura (FR-033, SC-009)

El pipeline nunca escribe en Firestore, en ninguna de las dos fuentes
(snapshot o Firestore en vivo): toda la extracción es de lectura. Cada fila
migrada conserva su `firestore_id` (`NOT NULL UNIQUE` en las tablas con
equivalente 1:1 en origen; `NULL` en los `grupos_jueces` exclusivos
derivados, que no tienen colección de origen — D8), para poder auditar
destino contra origen en cualquier momento posterior a la migración.

## Anomalías conocidas (D-15, D-16, D-17) — patrones, no valores fijos

La corrida de prueba encontró tres anomalías de datos no cubiertas por la
verificación previa. `docs/runbook-corte-produccion.md` las generaliza como
**patrones a detectar** en cualquier corrida futura (no como los tres casos
puntuales que aparecieron esta vez):

| Patrón general | Dónde se detecta en este código | Visto en la corrida de prueba |
|---|---|---|
| Localidad sin `latitud` o sin `longitud` | `transform/localidades.js` | 1 caso (CABA, D-15) |
| `jueces_asistidos` con el string `"0"` explícito (no ausente, no pool) | `transform/asignaciones-jueces.js#resolverModoAsignacion` | 9 casos (D-16) |
| Código de taxonomía fuera del catálogo válido (`taxonomia_codigos`) | `transform/taxonomia.js` | 1 caso (`"F"` en `presencia_territorial`, D-17) |

**Aviso importante sobre el estado actual del código** (transparencia, no un
"está resuelto"): de estos tres, solo el patrón de `jueces_asistidos` está
implementado como detección genuinamente genérica (compara el valor, no el
id del documento) — pero incluso ahí, el código **resuelve automáticamente**
todas las coincidencias como "sin jueces" en vez de frenar para
confirmación humana caso por caso, que es lo que
`docs/runbook-corte-produccion.md` exige para el corte real (distinguir
"administrativa sin jueces por diseño" de "jueces pendientes de asignar" no
es automatizable). Los otros dos (`COORDENADAS_COMPLETADAS` en
`localidades.js`, `CORRECCIONES_CODIGO` en `taxonomia.js`) están
hardcodeados a los `firestore_id` puntuales vistos en esta corrida: si el
patrón vuelve a aparecer en un documento **distinto** en el corte real, el
código sí frena (lanza error, no asume el mismo valor a ciegas), pero si
reaparece en el **mismo** documento no vuelve a pedir confirmación — lo
reaplica en silencio. Antes de usar este código para el corte real, ajustar
los tres casos para que **siempre** frenen y esperen confirmación humana al
detectar el patrón, tal como pide el runbook — no solo la primera vez que
aparece un documento nuevo.

## Validación posterior

Después de una corrida, `db/validation/*.sql` valida el resultado contra los
datos reales (no contra el esquema solamente): `relaciones.sql`,
`conteo_jueces.sql`, `reglas_asignacion.sql`, `integridad.sql`,
`integridad_rechazo.sql`, `identidad.sql`, `fueros.sql`. Ver
`specs/001-modelo-datos-relacional/quickstart.md` Paso 5 para el detalle de
qué prueba cada uno.
