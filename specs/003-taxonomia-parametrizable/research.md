# Research: Taxonomía de organismos parametrizable por preguntas

Feature `003-taxonomia-parametrizable`. Cierra los dos gates pendientes del
Constitution Check (Principio VIII, X) y responde la pregunta técnica
explícita del usuario: qué herramienta de migraciones versionadas conviene
para `public.*`, dado que hoy ese esquema se aplicó una sola vez a mano.

---

## Decisión 1 — Herramienta de migraciones para `public.*`: el `Migrator` de Kysely, no un paquete nuevo

**Decisión**: usar la clase `Migrator` + `FileMigrationProvider` que trae
`kysely` (ya instalado en `backend/`, versión `0.28.17`), con las
migraciones como archivos `.ts` en `backend/migrations/`, ejecutadas por un
script corredor (`backend/scripts/migrate-public.ts`), análogo a
`migrate-auth.ts` (`002-backend-api-carga-datos`) pero apuntando a
`public.*` en vez de `auth.*`.

**Rationale**:
- **Cero dependencia nueva**: `kysely` ya es una dependencia directa del
  backend — se usa para el adaptador de Better Auth (`auth/index.ts`) y ya
  se usó directamente en `scripts/migrate-auth.ts` y en los spikes de
  `002-backend-api-carga-datos`. Agregar `node-pg-migrate` (la alternativa
  más popular) sumaría un segundo mecanismo de migraciones al mismo
  backend, con su propia tabla de tracking y su propia CLI, cuando ya hay
  uno instalado que resuelve el mismo problema.
- **DDL transaccional real**: el `Migrator` de Kysely corre cada migración
  dentro de una transacción cuando el dialecto la soporta (Postgres la
  soporta) — si algo falla a mitad de camino (incluida la reconciliación,
  ver Decisión 3), la migración completa se revierte. Es exactamente el
  comportamiento "todo o nada" que exige el Principio X, sin código de
  rollback manual.
- **Consistente con lo que el proyecto ya usa para consultar `public.*`**:
  las rutas de `002-backend-api-carga-datos` usan `pg` directo (no Kysely)
  para las consultas de aplicación — eso no cambia; el `Migrator` de Kysely
  es solo para las migraciones de esquema en sí, un caso de uso distinto
  (DDL versionado) de "hacer queries de la aplicación" (donde `pg` directo
  sigue siendo la decisión correcta, `002-backend-api-carga-datos`
  research.md Decisión 6, sin cambios acá).
- **Separado del mecanismo de `auth.*`**: Better Auth migra su propio
  esquema con `getMigrations`/`runMigrations` de `better-auth/db/migration`
  (`002-backend-api-carga-datos`, research.md Decisión 3, actualización
  2026-09-19) — un mecanismo interno de esa librería, no reutilizable para
  `public.*` (no sabe nada de nuestras tablas de dominio). El `Migrator` de
  Kysely es el mecanismo *nuestro*, para el esquema que nosotros diseñamos
  — dos mecanismos distintos para dos esquemas con dueños distintos, tal
  como pedía el usuario ("Better Auth usa el suyo propio; esto necesita el
  suyo").

**Alternatives considered**:
- **`node-pg-migrate`**: confirmado activamente mantenido (release de julio
  2026) y con cobertura más completa de features específicas de Postgres
  (funciones, triggers, policies, roles) que el `Migrator` genérico de
  Kysely. Descartado igual: sumaría una segunda tabla de tracking
  (`pgmigrations` por default) y una segunda convención de migraciones al
  mismo backend que ya tiene una (Kysely, vía `auth.*`) — no hay una
  necesidad concreta de esta feature (triggers, funciones) que el
  `Migrator` de Kysely no pueda expresar con SQL crudo dentro de la
  migración (Kysely permite `sql\`...\`` para cualquier DDL que su query
  builder no cubra directamente, como el trigger de integridad de
  Decisión 2).
- **Prisma Migrate / Drizzle Kit**: descartados — ambos exigen adoptar su
  ORM como capa de acceso a datos, contradiciendo la decisión ya tomada en
  `002-backend-api-carga-datos` (research.md Decisión 6) de `pg` directo
  sin ORM para el código de aplicación. Meterlos solo para migraciones,
  sin usar el resto del ORM, es más superficie nueva que la que resuelve.
- **Flyway / Sqitch**: descartados — herramientas externas al ecosistema
  Node (JVM y Perl respectivamente); el usuario pidió explícitamente
  reutilizar el mismo backend, no sumar un runtime nuevo al proceso de
  deploy.
- **`kysely-ctl`** (CLI oficial de Kysely sobre el `Migrator`): no se usa —
  agrega generación de archivos y comandos interactivos que esta feature no
  necesita (una sola migración, no un flujo de autoría continuo todavía);
  se puede adoptar más adelante sin migrar lo ya escrito, porque sigue
  siendo el mismo `Migrator`/formato de archivo por debajo.

Sources:
- [node-pg-migrate — npm](https://www.npmjs.com/package/node-pg-migrate)
- [node-pg-migrate — docs](https://salsita.github.io/node-pg-migrate/)
- [Kysely — Migrator/FileMigrationProvider (código fuente instalado, `node_modules/kysely/dist/esm/migration/migrator.d.ts`)]

### Corrección menor (2026-09-22) — `migrationTableSchema: 'migrations'`

Al aplicar la migración 0001 en firme, el `Migrator` creó sus dos tablas
propias de tracking (`kysely_migration`, `kysely_migration_lock`) en
`public` por default — no se había configurado `migrationTableSchema` en
`MigratorProps` (opción que la propia librería expone para esto). No es una
decisión de arquitectura nueva, es cerrar la Decisión 1 tal como ya estaba
pensada: mismo criterio que `auth.*` (esquema propio para infraestructura
de una herramienta, separado del dominio) — simplemente faltó pasar la
opción.

**Corrección aplicada**: esquema `migrations` (nombre elegido por
consistencia con `auth` — describe el propósito, no repite el nombre de la
librería) para las dos tablas de tracking, vía
`migrationTableSchema: 'migrations'` en `backend/scripts/migrate-public.ts`.

**Cómo se corrigió sin re-ejecutar la migración 0001** (que hubiera fallado
— `CREATE TABLE taxonomia_preguntas` sin `IF NOT EXISTS` contra una tabla
que ya existe): se creó el esquema `migrations` y se reubicaron las dos
tablas existentes con `ALTER TABLE ... SET SCHEMA migrations` (conserva su
contenido, incluida la fila que marca `0001_taxonomia_parametrizable` como
ya ejecutada) — no un `DROP` + recreación. Verificado después: `public.*`
volvió a sus 23 tablas exactas (19 originales + 4 de esta feature, sin las
2 de tracking); `migrations.kysely_migration` conserva el mismo registro
con el mismo timestamp; volver a correr `migrate-public.ts` con la config
nueva imprime "Nada que migrar" (encuentra el historial en su ubicación
nueva, no reintenta nada); los conteos de dominio (`organismos=117`,
`usuarios=47`, `grupos_jueces=262`, `taxonomia_preguntas=9`,
`taxonomia_opciones=32`, `evaluaciones_taxonomicas=801`,
`evaluaciones_taxonomicas_v1_legacy=89`) no cambiaron.

---

## Decisión 2 — Integridad "respuesta → opción de la pregunta correcta": trigger, mismo patrón que `001-modelo-datos-relacional`

**El riesgo (FR-007/FR-008, Principio VIII)**: una fila de
`evaluaciones_taxonomicas` (reformulada) con `opcion_id` debe apuntar a una
opción que pertenezca a la MISMA `pregunta_id` que esa fila declara. Un
`CHECK` de columna no puede expresar esto (necesita comparar contra otra
tabla); una FK simple tampoco (una FK a `taxonomia_opciones.id` no puede
"saber" cuál `pregunta_id` tiene esa fila).

**Decisión**: un trigger `BEFORE INSERT OR UPDATE` sobre
`evaluaciones_taxonomicas`, mismo patrón que
`trg_asignacion_fuero_dentro_de_uf` de `001-modelo-datos-relacional`
(`db/schema.sql`): rechaza la fila si `opcion_id` no es NULL y no resuelve
a una opción cuyo `pregunta_id` coincida con el `pregunta_id` de la fila.
Un segundo trigger (o el mismo, con más de una validación) cubre FR-004/
FR-008: rechaza si la pregunta no es categórica/opción-múltiple y la
respuesta trae `opcion_id`, o si es categórica/opción-múltiple y la
respuesta trae `valor_texto`/`valor_numero` en vez de `opcion_id`.

**Rationale**: no es una regla nueva inventada para esta feature — es
literalmente el mismo problema estructural que ya resolvió
`001-modelo-datos-relacional` (FR-018f: un fuero de asignación no puede
exceder los fueros del organismo de la UF) con la misma herramienta
(trigger). Reusar el patrón ya validado en vez de inventar uno nuevo es
consistente con Principio XII (trazabilidad) y evita relitigar una decisión
de diseño ya tomada para un problema con la misma forma.

**Alternatives considered**: validar solo en la capa de aplicación (backend)
— descartado, es exactamente lo que el Principio VIII prohíbe ("integridad
referencial explícita", no una convención de aplicación); una referencia
rota debe ser imposible por diseño, no solo improbable porque el código que
inserta hoy es cuidadoso.

---

## Decisión 3 — Reconciliación: reutilizar `migracion_reconciliacion`, no una tabla nueva

**Decisión**: la migración escribe una fila en `migracion_reconciliacion`
(la misma tabla de `001-modelo-datos-relacional`, sin cambiar su forma) con
`entidad = 'evaluaciones_taxonomicas_respuestas'`, `conteo_origen` = la
cuenta real de valores no nulos en las 9 columnas de la tabla vieja
(`SELECT` sumando `count(columna) por cada una de las 9`, no un `801`
hardcodeado — para que la reconciliación sea real incluso si algún
organismo tuviera un valor nulo en alguna columna, caso no encontrado hoy
pero que la consulta no debe asumir), `conteo_destino` = filas realmente
insertadas en la tabla de respuestas nueva. Si difieren, la migración hace
`RAISE EXCEPTION` — dentro de la transacción del `Migrator` (Decisión 1),
eso aborta toda la migración, no deja el esquema a medias.

**Rationale**: `migracion_reconciliacion` ya existe, ya tiene la forma
correcta para esto (`entidad`, `conteo_origen`, `conteo_destino`,
`resultado`, `corrida_a`, `detalle`), y es precisamente el mecanismo que el
Principio X pide usar para toda migración de datos del proyecto — no hay
razón de dominio para que esta reconciliación tenga una tabla propia
distinta a la que ya usan las 10 entidades de `001-modelo-datos-relacional`.
Mantener un solo lugar para "toda reconciliación de este proyecto" es más
auditable que dispersarlas.

**Alternatives considered**: una tabla de reconciliación nueva y específica
de esta feature — descartada, duplicaría sin necesidad una tabla que ya
cumple la función, y fragmentaría el historial de reconciliaciones del
proyecto en dos lugares distintos sin ningún beneficio.

---

## Decisión 4 — Qué pasa con la tabla vieja de 9 columnas: se renombra y se conserva, no se borra en esta migración

**Decisión**: dentro de la misma migración, la tabla actual
`evaluaciones_taxonomicas` (9 columnas) se renombra a
`evaluaciones_taxonomicas_v1_legacy` antes de crear la nueva
`evaluaciones_taxonomicas` (tabla de respuestas) en su lugar. La tabla
`_v1_legacy` **no** se borra en esta migración.

**Rationale**: mismo espíritu que Principio IX/X aplicado a una migración
de esquema (no de sistema origen→destino, pero el mismo riesgo de fondo):
no se destruye el dato de origen hasta tener confianza post-corte. Acá el
"corte" es la migración de esquema misma — conservar la tabla vieja
renombrada, por al menos un ciclo, permite auditar manualmente cualquier
discrepancia que la reconciliación automática no haya anticipado, sin
depender de un backup externo. Borrarla es una decisión explícita para una
migración posterior, no de esta.

**Alternatives considered**: borrar `evaluaciones_taxonomicas` (vieja) en la
misma migración, apoyándose solo en que la reconciliación ya validó el
conteo — descartado: la reconciliación valida *cantidad*, no
necesariamente *cada valor individual* sin una auditoría manual adicional
(ver `quickstart.md` para esa verificación); conservar la tabla vieja un
ciclo más es de costo casi nulo (89 filas) y elimina la necesidad de
confiar ciegamente en que el conteo alcanza como única prueba.

---

## Decisión 5 — Gap real de FR-004 en `taxonomia_opciones`: migración 0002 nueva, no un ajuste a la 0001

**El hallazgo** (encontrado al verificar T014, no anticipado en el diseño
original): la migración 0001 protege FR-004 ("una pregunta numérica o de
texto libre no admite opciones") solo del lado de las *respuestas*
(`validar_respuesta_taxonomia()`, Decisión 2) — nada impide insertar
directamente una fila en `taxonomia_opciones` cuyo `pregunta_id` apunte a
una pregunta `numerica`/`texto_libre`. Confirmado empíricamente: se pudo
insertar una opción "colgada" de una pregunta numérica sin ningún rechazo
(`db/validation/taxonomia_pregunta_nueva.sql`, caso (d)).

**Decisión**: corregir el gap con una migración **0002 nueva**
(`backend/migrations/0002_taxonomia_opciones_guarda_tipo.ts`), no editando
el archivo ya aplicado `0001_taxonomia_parametrizable.ts`.

**Rationale**:
- La migración 0001 ya está aplicada en la base real y trackeada por
  nombre en `migrations.kysely_migration` (Decisión 1). El `Migrator` de
  Kysely identifica cada migración por el nombre de su archivo y la marca
  como ejecutada una sola vez — editar el contenido de `0001_...ts` ahora
  **no volvería a correr nada** en esta base (no hay ningún efecto), pero
  dejaría el archivo diciendo una cosa y el historial de ejecución
  diciendo otra: cualquier entorno nuevo que corra `migrate-public.ts`
  desde cero vería un 0001 con la guarda ya incluida, mientras que en esta
  base la guarda tendría que aplicarse aparte a mano — exactamente la
  clase de deriva entre "lo que el archivo dice que pasó" y "lo que
  realmente pasó" que un sistema de migraciones versionadas existe para
  evitar.
- Es además el mismo criterio que el proyecto ya sostiene en otros
  lugares: ninguna migración/esquema ya aplicado se edita retroactivamente
  en `001-modelo-datos-relacional` ni en `002-backend-api-carga-datos` —
  los ajustes posteriores a algo ya aplicado se hicieron como corrección
  operativa documentada (ver la corrección menor de `migrationTableSchema`
  más arriba, que tampoco reescribió 0001: reubicó tablas con `ALTER
  TABLE ... SET SCHEMA`) o, cuando el cambio es de esquema/lógica y no solo
  de ubicación, como una migración nueva.
- El mecanismo de corrección (trigger `BEFORE INSERT OR UPDATE` sobre
  `taxonomia_opciones`) reutiliza exactamente el mismo patrón que
  Decisión 2 (`validar_respuesta_taxonomia()`), por el mismo motivo: un
  `CHECK` de columna no puede consultar `taxonomia_preguntas.tipo_respuesta`
  de otra tabla.

**Alternatives considered**: editar `0001_taxonomia_parametrizable.ts`
directamente, ya que — al no haber otro entorno con la base aplicada
todavía — no hay riesgo *inmediato* de un entorno desincronizado.
Descartado: el archivo de migración es el contrato de lo que produce una
base nueva, no solo un registro de lo que pasó en esta; ese contrato dejó
de ser cierto en el momento en que la migración se ejecutó y quedó
trackeada. Corregirlo con una migración nueva mantiene el invariante
"lo que corrió = lo que el historial dice que corrió" sin excepciones,
en vez de crear una la primera vez que aparece un gap real.
