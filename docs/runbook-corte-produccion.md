# Runbook de corte a producción — Observatorio de Oficinas Judiciales

> **Estado:** documento vivo, iniciado el 2026-09-18 a partir de la
> experiencia de la migración de prueba Firestore→PostgreSQL (feature
> `001-modelo-datos-relacional`). Se sigue alimentando durante el resto de
> esta migración (US4, US5, polish) y durante el desarrollo de la nueva app
> (backend, frontend), si algo de ese desarrollo cambia el modelo de datos
> o el proceso de corte.
>
> **Esto no es la migración de prueba.** Es el proceso que se ejecuta **una
> sola vez**, cuando la nueva app esté probada y lista, para reemplazar la
> app vieja en producción. La migración de prueba (este mismo código, corrido
> contra un snapshot del 2026-09-16/18) sirvió para construir y validar este
> proceso — no es el corte en sí.

---

## Principio rector

Ninguna anomalía de datos se resuelve automáticamente sin confirmación
humana, aunque ya se haya visto un caso igual antes. El código **detecta y
detiene**; una persona **decide y confirma**. Esto es deliberado: las tres
anomalías que aparecieron en la migración de prueba (ver abajo) se resolvieron
con conocimiento de dominio específico de ese caso puntual — automatizar la
misma resolución para un caso nuevo y distinto sería repetir el error que el
Principio VII de la constitution existe para evitar (no asumir sobre datos no
verificados).

---

## Prerrequisitos antes de arrancar

- **Pipeline de reporting nuevo, desde PostgreSQL, en producción** (Fase D
  de `docs/plan-camino-a-produccion.md`) — no un ítem de backlog: los
  tableros de DataStudio/Looker Studio que la app ya enlaza leen hoy de un
  pipeline hacia Firestore. El paso 1 de abajo apaga Firestore; si el
  pipeline nuevo no está resuelto para ese momento, los tableros existentes
  quedan sin datos el mismo día del corte. No se avanza al paso 1 sin esto
  confirmado.

---

## Pasos del corte real

1. **Congelar el origen.** Poner Firestore en modo solo lectura (Principio
   IX) *antes* de exportar — no después. Ningún alta o edición debe poder
   ocurrir entre el export y el encendido de la app nueva.
2. **Export fresco.** Nunca reusar un snapshot de una corrida de prueba
   anterior — el corte real exporta el estado real al momento del corte, no
   un estado de hace semanas.
3. **Ambiente Postgres reproducible por script**, no por comandos tipeados a
   mano en una sesión de terminal. Debe incluir, desde el vamos: creación de
   rol, base, extensión `citext`, y **ownership correcto de tablas/vistas/
   secuencias/tipos asignado a ese rol en el mismo script que las crea** — en
   la migración de prueba esto se corrigió a mano después de un error; en el
   corte real no debería hacer falta corregir nada.
4. **Detección de anomalías conocidas** (ver tabla abajo) — el pipeline debe
   señalar cada caso que matchee un patrón ya visto, y **detenerse** a
   esperar confirmación humana antes de aplicar la resolución, aun cuando la
   resolución ya esté documentada de una vez anterior.
5. **Detección de anomalías nuevas** — cualquier caso que no matchee ningún
   patrón conocido debe frenar la carga de ese registro puntual (no de todo
   el pipeline) y quedar listado para revisión manual antes de reintentarlo.
6. **Reconciliación como gate real, no como reporte posterior.** Si algún
   conteo origen/destino no coincide, la app nueva **no se enciende** — el
   corte se aborta y se investiga, tal como ya hace `reconcile.js`
   (`DiscrepanciaAbiertaError`, FR-032). Esto ya está bien diseñado; el
   runbook solo lo explicita como criterio de ir/no ir del corte, no solo
   como comportamiento del script.
7. **Mergear la rama de integración a `main`, recién en este momento.**
   Todo el desarrollo de la reformulación (modelo de datos, backend,
   frontend, reporting) vive en una rama de integración separada
   (`reformulacion`), no en `main` — porque `main` sigue desplegando la app
   vieja en producción vía Vercel durante todo el desarrollo (Principio IX),
   y un merge prematuro dispararía un deploy no deseado. El corte real es el
   único momento en que `reformulacion` se mergea a `main`, y solo después
   de que el paso 6 (reconciliación) haya dado gate verde.
8. **Encender la app nueva recién con el merge del paso 7 hecho y
   desplegado.**

---

## Cambios manuales en la base fuera de migraciones

El paso 3 de arriba exige un ambiente Postgres reproducible **por
script**, no por comandos tipeados a mano. Verificado contra
`backend/migrations/` y `db/seeds/` (2026-10-10): estos cambios se
hicieron a mano por `psql` en el servidor de desarrollo y **no están
capturados en ningún script** — correr `db/schema.sql` + `db/seeds/` +
`backend/migrations/` de punta a punta en un ambiente nuevo, hoy, NO
reproduce el estado real de esta base. Hay que convertir cada uno en una
migración (o corregir el seed correspondiente) antes del corte real.

| Cambio | ¿En alguna migración? | ¿En `db/seeds/`? | Verificado |
|---|---|---|---|
| Columna `provincias.codigo_iso` (`ALTER TABLE` + `UPDATE`, 2026-09-30) | **Sí, desde 2026-10-12** — `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` + `UPDATE` por id, al inicio de `up()` de `0005_vistas_reporting_dashboard1.ts` (excepción deliberada a "no se edita una migración aplicada" — justificada en el propio comentario del archivo; no-op en la base real, que ya tenía la columna) | No — `db/schema.sql` sigue sin ella a propósito (ver más abajo, "Orden real de reconstrucción") | Reproducido el fallo (`column p.codigo_iso does not exist` en `0005`) y la corrección en una base descartable antes de aplicar nada a la base real. |
| Nombres de provincia corregidos (Entre Ríos, Río Negro, CABA → "Ciudad Autónoma de Buenos Aires", Tierra del Fuego → nombre largo con Antártida) | **Sí, desde 2026-10-12** — `0016_nombres_provincia_corregidos.ts`, `UPDATE` por id, idempotente, `down()` restaura los nombres viejos | No, a propósito — ver más abajo por qué | `migration/` (carga de Firestore) cruza provincias por NOMBRE, no por id (`buildNameIdMap` en varios `load/*.js`) contra el string que viene de Firestore — si el seed ya tuviera el nombre corregido, esa carga fallaría con "provincia desconocida" en cada fila de esas 4 provincias. Por eso el seed se deja como está y la corrección va en una migración que corre DESPUÉS de la carga de Firestore (ver orden real abajo). |
| Fueros agregados: `contencioso administrativo`, `de paz`, `penal juvenil` | No — ninguna migración toca la tabla `fueros` | No — `db/seeds/05_fueros.sql` solo siembra los 4 originales (`penal`, `civil`, `familia`, `laboral`) | `SELECT nombre FROM fueros` real tiene 7 filas; el seed, 4. **Fuera de alcance** de esta verificación (no analizado ni corregido). |
| Rol `metabase_ro` (rol de Postgres de solo lectura, no la tabla `roles` de la app) | No, y **no va a ir** — lleva contraseña, nunca en un archivo versionado | No — `db/seeds/06_roles.sql` siembra la tabla `roles` de la app (`admin`/`usuario_normal`), no tiene relación con esto | `SELECT rolname FROM pg_roles WHERE rolname='metabase_ro'` existe; sin `CREATE ROLE` en ningún script del repo. Paso manual documentado abajo. |

No se marcan más candidatos que estos cuatro — son los que se pidió
verificar. Puede haber otros cambios a mano no relevados todavía; este
chequeo no es exhaustivo sobre toda la base, solo sobre esta lista.

### Paso manual: crear el rol `metabase_ro`

No va en ninguna migración — lleva contraseña, y ninguna credencial vive
en un archivo versionado (Principio XIII). Se ejecuta a mano, **ANTES**
de `npm run migrate:public` — las migraciones desde `0006` le hacen
`GRANT`/`REVOKE` *si el rol ya existe* (nunca lo crean), así que si este
paso no se hizo todavía, esas migraciones simplemente no le otorgan nada
todavía (no fallan, pero tampoco sirven de nada hasta que el rol exista).

```sql
CREATE ROLE metabase_ro WITH LOGIN PASSWORD '<definir>';
GRANT CONNECT ON DATABASE observatorio TO metabase_ro;
GRANT USAGE ON SCHEMA public TO metabase_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO metabase_ro;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO metabase_ro;
```

El `ALTER DEFAULT PRIVILEGES` cubre tablas/vistas que se creen **después**
de este paso (p. ej. las vistas de reporting de `0005` en adelante) —
sin él, cada vista nueva necesitaría su propio `GRANT` manual otra vez,
que es justo el problema que encontró `0006` (D21,
`docs/decisiones-pendientes.md`): los permisos de esta base real se
otorgaron por objeto, no con `ALTER DEFAULT PRIVILEGES`, y las vistas de
`0005` se quedaron sin acceso hasta que `0006` lo corrigió. Hacerlo bien
en este paso manual evita repetir ese mismo problema en una reconstrucción
nueva.

### Orden real de reconstrucción desde cero (reemplaza al de 3 pasos de `quickstart.md`)

`specs/001-modelo-datos-relacional/quickstart.md` (Pasos 1-3) documenta
un orden de **3** pasos (esquema, seeds, herramienta de migración) — es
de antes de que existieran las migraciones Kysely (`backend/migrations/`,
desde `003-taxonomia-parametrizable`) y quedó **desactualizado**: no
menciona un paso que hoy es obligatorio. El orden real, verificado
(2026-10-10/12) reconstruyendo en una base descartable:

1. **`db/schema.sql`** — esquema base. `provincias` sin `codigo_iso` a
   propósito (ver tabla de arriba).
2. **`db/seeds/01..07_*.sql`**, en orden — catálogos, con los nombres de
   provincia SIN corregir a propósito (ver tabla de arriba).
3. **`migration/`** (herramienta Firestore→Postgres, `node run.js`) —
   carga los datos reales/snapshot. Precondición de su propio README:
   esquema + seeds ya aplicados.
4. **`backend/migrations/` (`npm run migrate:public`)** — con el paso
   manual de `metabase_ro` (arriba) hecho **antes** de este paso, no
   después.

**El paso 4 depende del paso 3**, no son independientes: la migración
`0001_taxonomia_parametrizable.ts` no es solo DDL — renombra
`evaluaciones_taxonomicas` a `_v1_legacy` y después hace un
`INSERT...SELECT` (unpivot) que **lee esa tabla** para poblar la nueva
`evaluaciones_taxonomicas` (801 filas reales en la base real, según
`specs/003-taxonomia-parametrizable/research.md`). Si el paso 4 corriera
antes que el 3, ese backfill operaría sobre una tabla vacía — no da
error, pero pierde datos reales en silencio. Reproducido en la base
descartable saltando el paso 3 a propósito (sin usar datos reales): el
backfill corrió con 0 filas, consistente con el diagnóstico.

**Detalle de implementación de Kysely, verificado en el código fuente de
la librería (`node_modules/kysely/dist/esm/migration/migrator.js`):**
`migrateToLatest()` envuelve **todo el batch de migraciones pendientes de
una corrida** en una sola transacción cuando el adapter soporta DDL
transaccional (Postgres sí) y no se pasó `disableTransactions` (este
proyecto no lo pasa, `backend/scripts/migrate-public.ts`). Si una
migración del batch falla, se revierten **todas** las de esa misma
corrida — incluidas las que ya habían impreso "ejecutada correctamente"
en la consola. Confirmado al reproducir el fallo de `codigo_iso`: después
del error en `0005`, `migrations.kysely_migration` tenía **0 filas**,
aunque `0001` a `0004` habían impreso éxito. En la base real esto no
pasó porque `0001`-`0015` se aplicaron en corridas separadas a lo largo
de varios días, no en una sola invocación — pero conviene saberlo: si una
reconstrucción futura corre `npm run migrate:public` una sola vez y falla
a mitad de camino, **revisar `migrations.kysely_migration`** antes de
asumir que lo anterior quedó aplicado.

**No volver a correr `migration/` (la carga desde Firestore) sobre una
base que ya tiene `0016` aplicada.** `0016_nombres_provincia_corregidos.ts`
deja `provincias.nombre` con los 4 nombres corregidos (Entre Ríos, Río
Negro, Ciudad Autónoma de Buenos Aires, Tierra del Fuego con el nombre
largo) — pero `migration/` sigue cruzando provincias por **nombre**
contra Firestore (`buildNameIdMap`, ver tabla de arriba), y Firestore
tiene los nombres viejos. Si `migration/` corriera después de `0016`,
fallaría con `"provincia desconocida"` en cada organismo/localidad/
usuario/grupo de esas 4 provincias. La reconstrucción **siempre** parte
de `db/schema.sql` + `db/seeds/` (nombres viejos, sin corregir) — nunca
de una base que ya pasó por `0016` — y recién después de que `migration/`
termine entran las migraciones Kysely (que incluyen `0016`, al final de
ese mismo orden).

---

## Anomalías conocidas (detectar y frenar para confirmación — no auto-resolver)

| Patrón | Visto en migración de prueba | Regla de detección |
|---|---|---|
| Localidad sin `latitud`/`longitud` | 1 caso (CABA, D-15) | Cualquier localidad con alguno de los dos campos nulo → frenar, mostrar el documento, pedir coordenada de referencia pública y su fuente antes de cargar. |
| `jueces_asistidos` como string `"0"` explícito | 9 casos (D-16) | Cualquier UF con ese valor exacto → frenar y listar para confirmar si es "administrativa sin jueces por diseño" (D6) o "jueces pendientes de asignar" (dato incompleto, no estructural) — son dos resoluciones distintas, no la misma. |
| Código de taxonomía fuera del catálogo válido | 1 caso ("F", D-17) | Cualquier código no presente en `taxonomia_codigos` → frenar, mostrar el organismo y el código recibido, pedir confirmación del código correcto — no asumir el mapeo usado la vez anterior. |

---

## Backup y restauración de PostgreSQL

**Hoy (servidor de desarrollo):** la base es de **pruebas** — no hay
backup periódico configurado. Existe un dump suelto,
`~/backups/observatorio-2026-10-07.dump` (158 KB), sin versionar y con
restauración nunca probada de punta a punta (ver también
`docs/plan-camino-a-produccion.md`, Fase E).

**Antes del corte** (entre el paso 6 — reconciliación, gate verde — y el
paso 8 — encender la app nueva — de "Pasos del corte real" arriba):

1. Dump de la base recién migrada, apenas la reconciliación dio gate
   verde y antes de encender la app nueva — el dump de referencia del
   corte es el de ESE momento, no uno de una corrida anterior.
2. Verificar el dump con `pg_restore -l` (lista el contenido sin
   restaurar) y además restaurarlo de verdad en una base **descartable**
   (no la real), comparando conteos de filas contra la base original —
   un índice legible no prueba que la restauración completa funcione.

**Después del corte** (producción real, no discutido en detalle
todavía): backup periódico — frecuencia y retención a definir —, con una
copia **fuera** del servidor, y una prueba de restauración periódica (no
solo al armar el backup la primera vez). Consultar a rplazas si el host
ofrece snapshots del volumen a nivel infraestructura, como alternativa o
complemento al `pg_dump` aplicativo.

**Datos reales — D15.** Los dumps de Postgres contienen emails reales de
usuarios. Nunca en git. En el filesystem: archivo del dump en `600`
(lectura/escritura solo del dueño), directorio que lo contiene en `700`.

---

## Requerimientos a definir con el proveedor de infraestructura

Formalizados en `docs/plan-camino-a-produccion.md`, Fase E, sección
"Pedido al proveedor de infraestructura" (actualizada por última vez
2026-10-10) — ya no es un placeholder sin empezar. El pedido de
backups/snapshots que originalmente iba a vivir acá se resolvió en la
sección de arriba ("Backup y restauración de PostgreSQL") en su lugar.

---

## Historial

- **2026-09-18:** documento creado a partir de la migración de prueba de la
  feature `001-modelo-datos-relacional` (US1-US3 completos, D-15/D-16/D-17
  resueltas por Santi durante la corrida).
- **2026-10-10:** agregada "Cambios manuales en la base fuera de
  migraciones" (4 cambios hechos a mano por `psql` que ni una migración
  ni un seed reproducen: columna `provincias.codigo_iso`, 4 nombres de
  provincia corregidos, 3 fueros agregados, el rol `metabase_ro`); y
  "Backup y restauración de PostgreSQL" (antes/después del corte,
  movida acá desde el pedido al proveedor de infraestructura de
  `docs/plan-camino-a-produccion.md`).
- **2026-10-12:** resueltos 2 de los 4 cambios manuales de la tabla de
  arriba. `provincias.codigo_iso` — excepción deliberada a "no se edita
  una migración aplicada": `ALTER TABLE ADD COLUMN IF NOT EXISTS` +
  `UPDATE` por id agregado al inicio de `up()` de
  `0005_vistas_reporting_dashboard1.ts` (no-op en la base real, ya
  tenía la columna). Nombres de provincia — migración nueva,
  `0016_nombres_provincia_corregidos.ts`, `UPDATE` por id, `down()`
  reversible. `metabase_ro` — paso manual documentado abajo (SQL exacto,
  sin contraseña), corregido el comentario de `0006` que mencionaba un
  "script aparte" que nunca existió. Agregadas las secciones "Orden real
  de reconstrucción desde cero" (4 pasos, reemplaza al de 3 de
  `quickstart.md`) y el detalle de que Kysely revierte el batch completo
  de una corrida si una migración falla. Probado de punta a punta en una
  base descartable (16/16 migraciones, 24/24 provincias con
  `codigo_iso`) y después aplicado a la base real: `0016` corrió sola
  (0001-0015 ya trackeadas), diff de `provincias` antes/después vacío,
  `tsc` limpio, suite completa 245/245. Dump de la base real tomado
  antes de aplicar (`~/backups/observatorio-2026-10-12.dump`, `600`,
  fuera del repo). Fueros: fuera de alcance, no tocados.
