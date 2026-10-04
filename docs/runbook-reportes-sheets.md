# Runbook: sincronización Postgres → Google Sheets (reporting, Fase D)

> Ayuda memoria para agregar un reporte nuevo sin depender de releer esta
> sesión. El código vive en `backend/scripts/reportes-sheets/`.

## Qué es y qué no es

Un script que lee vistas de Postgres (solo lectura, rol `metabase_ro`) y
**sobrescribe por completo** cada una en su propia pestaña de una planilla
de Google Sheets real. Cada corrida reemplaza el contenido entero de la
pestaña — no va acumulando filas. Sirve para vistas de **catálogo/KPI**
(el estado actual), no para un historial que deba crecer con el tiempo.

Corre dos veces por día vía cron (6:00 y 12:00 hora Argentina — ver
sección "Cron" más abajo). No decide qué vistas existen — eso lo hace la
migración de Postgres correspondiente (`backend/migrations/`).

## Piezas, qué hace cada una

| Archivo | Rol |
|---|---|
| `config.ts` | El mapeo `vista SQL -> pestaña`. **El único archivo que se toca para agregar un reporte.** |
| `postgres.ts` | `leerVista(pool, nombreVista)` — lee una vista completa, en el orden de columnas de la vista (no alfabético). |
| `sheets.ts` | `obtenerTokenSheets`, `asegurarHoja` (crea la pestaña si no existe), `sobrescribirHoja` (limpia + escribe). Único módulo que habla con la API de Sheets — un `fetch` a la API v4, sin el SDK `googleapis` completo (mismo criterio que `src/email/resend.ts` para Resend). |
| `sincronizar.ts` | El script principal: recorre `config.ts`, sincroniza cada reporte, una falla no frena a los demás, reporta al final. |

## Cómo agregar un reporte nuevo (de punta a punta)

1. **Crear la vista SQL** — una migración nueva en `backend/migrations/`
   (mismo patrón que `0005_vistas_reporting_dashboard1.ts` /
   `0007_vistas_detalle_dashboard1.ts`: `CREATE VIEW` vía Kysely + `sql`
   tag, con `up`/`down`, documentando en el comentario de dónde sale cada
   columna y qué reemplaza del dashboard original). **De detalle, no
   agregada** — ver la sección "Patrón: mandar detalle, no agregado" más
   abajo antes de escribir un `GROUP BY` en la vista. Correrla con
   `npm run migrate:public`.
2. **Agregar una línea a `config.ts`**: `{ vista: 'nombre_de_la_vista',
   hoja: 'Nombre de la pestaña' }`. Nada más — no hace falta tocar
   `postgres.ts`, `sheets.ts` ni `sincronizar.ts`.
3. **Correr** `npm run reportes:sincronizar` (ver prerrequisitos abajo). Si
   la pestaña no existe todavía en la planilla, el script la crea sola.
4. Confirmar en la planilla real que la pestaña nueva tiene los datos
   esperados.

## Prerrequisitos (variables de entorno)

Ninguna credencial vive en el repo (Principio XIII). Tres variables,
cargadas en `backend/.env` (o el entorno donde corra el script):

| Variable | Qué es |
|---|---|
| `METABASE_RO_DATABASE_URL` | Connection string de Postgres con el rol `metabase_ro` (solo lectura) — la misma que ya usa Metabase. |
| `GOOGLE_SHEETS_KEY_FILE` | Ruta al JSON de la cuenta de servicio de Google (no el contenido — la ruta en sí no es secreta). Hoy: `~/.secrets/observatorio/observatorio-reporting-sheets-key.json`. Esa cuenta de servicio necesita permiso de **Editor** sobre la planilla destino (compartida con su `client_email`). |
| `GOOGLE_SHEETS_REPORTING_ID` | El ID de la planilla (la parte de la URL entre `/d/` y `/edit`). |

## Comandos

```bash
cd backend
npm run reportes:sincronizar
```

Salida: una línea `OK`/`FALLÓ` por pestaña, y un resumen final
(`N/M pestañas sincronizadas`). Si alguna falló, el proceso termina con
código de salida distinto de cero (para que un cron futuro lo note sin
tener que parsear el log) — las que sí funcionaron ya quedaron escritas,
no se revierten.

## Patrón: mandar detalle, no agregado (para que Looker Studio filtre cruzado)

Corrección hecha en `0007_vistas_detalle_dashboard1.ts` sobre el diseño
original de 0005. Documentado acá para no repetir el error al agregar un
reporte nuevo.

**El problema**: `vista_organismos_por_tipo`, `vista_organismos_por_fuero`
y `vista_organismos_por_provincia` (0005) agregaban en SQL (`GROUP BY`) —
cada una llegaba a Sheets/Looker ya convertida en un número fijo por
categoría. Looker Studio filtra y cruza en el propio Looker (p. ej.
"mostrar organismos por tipo, filtrado a una sola provincia"), no
recalculando SQL — si la fila que le llega ya viene agrupada solo por
tipo, no tiene de dónde sacar el desglose por provincia que un filtro
cruzado necesitaría. El síntoma es un gráfico que no reacciona a un
filtro, o que reacciona mal.

**La regla**: mandar una fila por **entidad real** (un organismo, una
asignación), con sus columnas de catálogo sin tocar, y dejar que Looker
Studio agregue (`SUM`/`COUNT`/`COUNT DISTINCT` en la configuración del
propio gráfico) y filtre. `vista_organismos_detalle` reemplaza a las tres
vistas agregadas: una fila por organismo, con `tipo_oficina`,
`fuero_simplificado`, `provincia` y `codigo_iso` ya resueltos pero sin
ningún `GROUP BY` — el mismo dato de catálogo que antes, a nivel de
detalle en vez de pre-contado.

**La excepción — pensar la granularidad con cuidado**: esta regla no es
automática cuando el valor real vive en una **entidad distinta** de la
que se usa para filtrar. `jueces_asistidos` es el ejemplo: el número
real (`total_jueces`) es un atributo del **grupo de jueces**, pero lo que
se quiere filtrar/cruzar en el dashboard es por **organismo/UF** — y un
mismo grupo puede estar asignado a varias UF (D8/FR-018e). Mandar el
detalle "ingenuo" (una fila por asignación UF↔grupo, sumando
`total_jueces` a lo bruto) sobrecuenta exactamente igual que ya advertía
0005 para el cálculo viejo del dashboard (un grupo compartido entre 3 UF
suma su `total_jueces` tres veces). La solución en `vista_jueces_por_grupo`
no es agregar en SQL (eso traería de vuelta el problema original de
filtros), sino exponer el `grupo_jueces_id` como columna explícita: cada
fila sigue siendo detalle (una por asignación, filtrable por organismo),
pero quien construye el gráfico en Looker puede optar por contar grupos
**únicos** (`COUNT DISTINCT grupo_jueces_id`, o un gráfico aparte que
agrupe por `grupo_jueces_id` antes de sumar) en vez de sumar
`total_jueces` fila por fila. La granularidad correcta depende de qué
pregunta responde el gráfico — no hay una única vista que sirva para
"total de jueces" y para "jueces por organismo" al mismo tiempo sin que
alguien en Looker tome esa decisión explícitamente.

**`jueces_contables` (0009): la misma exposición explícita, pero sin
depender de que quien construye el gráfico se acuerde de deduplicar.**
`COUNT DISTINCT grupo_jueces_id` resuelve "cuántos grupos", no "cuántos
jueces" — un `SUM(total_jueces)` sigue sobrecontando si alguien arma un
gráfico sin saber de la trampa. `jueces_contables` es `total_jueces` en
UNA sola fila por `grupo_jueces_id` (la de menor `unidad_funcional_id` —
orden determinístico, vía `row_number() OVER (PARTITION BY grupo_jueces_id
ORDER BY unidad_funcional_id)`) y `0` en el resto de las filas del mismo
grupo. Con esto, `SUM(jueces_contables)` da el total correcto con
**cualquier** filtro (por organismo, por provincia, sin filtro) sin que
el autor del gráfico tenga que saber nada de grupos compartidos —
siempre que el filtro no excluya justo la fila "contable" de un grupo
(no pasa hoy: ver la condición de abajo). `total_jueces` sigue existiendo
sin tocar, para quien quiera el total real del grupo fila por fila.

Condición para que `jueces_contables` sea correcto por provincia: ningún
grupo compartido puede cruzar provincias (si la UF "contable" de un
grupo quedara en una provincia distinta de otra UF que también usa ese
grupo, atribuirle todo el total a una sola fila distorsionaría el
desglose por provincia). Verificado contra la base real al escribir
0009 (2026-10-04): 0 discrepancias — la provincia de cada UF
(`localidades.provincia_id`) coincide siempre con `grupos_jueces.provincia_id`
del grupo que usa, para los 266 registros de la vista. Coincide con
V3.11 de `001-modelo-datos-relacional`. Si una carga futura de datos
rompiera esto (un grupo compartido entre UF de provincias distintas),
`jueces_contables` seguiría sumando bien el total general pero el
desglose por provincia quedaría mal — revisar esta condición de nuevo
si se vuelve a tocar esta vista.

Verificado también: `SUM(jueces_contables) = 1975` (coincide con
`vista_kpis_generales.jueces_asistidos`, D8/FR-018e) y, filtrando por
cada una de las 20 provincias con jueces asignados, `SUM(jueces_contables)`
coincide exactamente con el total de esa provincia calculado por grupo
(sin duplicar grupos compartidos).

`vista_kpis_generales` no se tocó: es un KPI agregado genuino (un total
único, una sola fila), no un catálogo por entidad — no hay "detalle" al
que bajarla.

**Regresión conocida y aceptada**: el mapa coroplético pierde el "0
explícito" para una provincia sin ningún organismo (hoy: La Rioja y Santa
Cruz). `vista_organismos_por_provincia` partía del catálogo de provincias
con `LEFT JOIN` a organismos, así que esas dos aparecían con
`organismos = 0` (ver nota de color de 0 en Looker, más abajo).
`vista_organismos_detalle` parte de `organismos`, así que una provincia
sin ningún organismo no tiene ninguna fila — queda ausente del mapa en
vez de en cero (Looker la va a mostrar como "sin dato", un color distinto
al blanco documentado para el cero explícito). Aceptado a cambio de que
el resto del dashboard pueda filtrarse cruzado; recuperar el cero
explícito es trabajo futuro (un blend en el propio Looker Studio contra
el catálogo completo de provincias).

**Las vistas/pestañas viejas NO se borraron — conviven a propósito.**
Primer intento de esta corrección (0007) había eliminado
`vista_organismos_por_tipo`/`por_fuero`/`por_provincia`; se revirtió en
`0008_restaurar_vistas_agregadas_dashboard1.ts` porque esas tres siguen
activas, alimentando el reporte de Looker Studio **actual**, todavía en
uso — borrarlas de entrada rompía ese reporte antes de que el nuevo (con
filtros cruzados, sobre las vistas de detalle) estuviera listo para
reemplazarlo. `config.ts` hoy sincroniza las 6 pestañas a la vez: las 3
agregadas viejas + `vista_kpis_generales` + las 2 de detalle nuevas —
sumadas, no reemplazadas. Las 3 agregadas viejas se eliminan en una tarea
aparte (una migración nueva, no se edita 0007/0008), recién cuando el
dashboard nuevo reemplace por completo al actual — ahí también se sacan
sus 3 líneas de `config.ts`.

## Cron (corrida automática, 2x por día)

### Hallazgo de timezone (importante, verificarlo primero en cualquier servidor nuevo)

`timedatectl` no funciona en este contenedor (no hay systemd como PID 1).
El reloj real del sistema se confirmó por archivo: `/etc/timezone` y
`readlink -f /etc/localtime` → **UTC** (`Etc/UTC`). Esto contradice lo que
muestra `date` en una shell interactiva, que acá daba hora Argentina
(`-03`) — pero eso era solo porque la sesión de shell tenía `TZ` exportado,
no porque el reloj del sistema esté en Argentina. Un cron job no hereda el
`TZ` de ninguna shell interactiva, así que un `0 6,12 * * *` sin más
habría corrido a las 6/12 **UTC** = 3/9 de la mañana en Argentina — mal.
Confirmar siempre con `cat /etc/timezone` (no con `date` a ojo) antes de
fijar un horario en cron en un servidor nuevo.

### La solución: `CRON_TZ` + `TZ` en el propio crontab

En vez de depender de qué timezone tenga configurado el reloj del
servidor, el crontab fija su propia timezone — portable a cualquier
servidor, sea cual sea su UTC/local:

- `CRON_TZ=America/Argentina/Buenos_Aires`: variable especial que lee el
  cron de Debian/Ubuntu — hace que el horario de las líneas siguientes
  (`0 6,12 * * *`) se interprete en esa timezone, sin importar la del
  reloj del sistema. **Solo afecta cuándo dispara**, no se propaga al
  entorno del proceso que corre.
- `TZ=America/Argentina/Buenos_Aires`: variable normal de entorno (no
  especial para cron) — esta sí se pasa al proceso, para que el
  `$(date -Is)` que se escribe en el log también quede en hora Argentina
  y no en UTC (si no se pone, el job corre a la hora correcta pero el
  timestamp *dentro* del log confunde).

### Línea de crontab instalada (usuario `smigueles`)

```cron
# Observatorio — reporting Fase D (ver docs/runbook-reportes-sheets.md)
CRON_TZ=America/Argentina/Buenos_Aires
TZ=America/Argentina/Buenos_Aires
0 6,12 * * * cd /home/smigueles/devel/observatorio/backend && { echo "=== $(date -Is) ==="; set -a && . ./.env && set +a && /usr/bin/npx tsx scripts/reportes-sheets/sincronizar.ts; echo "exit=$?"; } >> /home/smigueles/logs/reportes-sheets/sincronizar.log 2>&1
```

Instalada con `crontab <archivo>` (reemplaza el crontab completo del
usuario — si en el servidor destino ya hay otras líneas de cron, agregar
esta al final de lo existente en vez de pisarlo). Ver con `crontab -l`.

Carga las variables igual que el resto del proyecto (`set -a; . ./.env;
set +a`, mismo patrón que se usa a mano) — ninguna credencial nueva, el
mismo `backend/.env` de siempre.

### Log

`/home/smigueles/logs/reportes-sheets/sincronizar.log` — fuera del repo
(no se commitea), crece sin rotar (primera versión; si crece demasiado
con el tiempo, rotarlo con `logrotate` es trabajo futuro, no bloqueante
hoy). Cada corrida agrega un bloque con timestamp, la salida normal del
script (una línea `OK`/`FALLÓ` por pestaña + resumen) y `exit=N` al final
— `grep FALLÓ` o `grep -v exit=0` alcanza para encontrar una corrida que
falló sin tener que mirar en el momento. No contiene ningún secreto: el
script nunca imprime la clave de la cuenta de servicio ni la contraseña
de `metabase_ro`, y el cron tampoco agrega nada que los exponga.

### Cómo quedó levantado el daemon en este servidor (y cómo en uno real)

Este contenedor no tiene systemd (`timedatectl`/`systemctl` fallan con
"Can't operate... Host is down"), y el script de init de Debian
(`invoke-rc.d`) tiene bloqueado el arranque automático de servicios
(`policy-rc.d denied execution of start`) — mismo tipo de limitación ya
vista con Postgres en este entorno (`pg_ctl reload` en vez de
`systemctl reload`). Por eso acá el daemon se instaló (`apt-get install -y
cron`) pero se inició a mano, directo: `sudo /usr/sbin/cron`. **Esto no
sobrevive un reinicio del contenedor** — si el contenedor se reinicia,
hay que volver a correr `sudo /usr/sbin/cron` (el crontab del usuario sí
persiste, queda guardado en `/var/spool/cron/`).

**En un servidor real (con systemd — el caso de producción)**, el
equivalente correcto es:

```bash
sudo apt-get install -y cron
sudo systemctl enable --now cron   # queda andando solo, sobrevive reboots
crontab -u smigueles <archivo-con-las-líneas-de-arriba>
```

Ahí no hace falta el paso manual de `/usr/sbin/cron` — eso es solo el
workaround para este contenedor sin systemd.

### Verificación hecha (antes de confiar en el horario real de 6am/12pm)

1. Corrida manual forzada del comando exacto del cron → log escrito, 4/4
   pestañas sincronizadas, `exit=0`.
2. Línea de prueba de un solo disparo agregada temporalmente al crontab
   (2 minutos en el futuro, en hora Argentina) para probar el *daemon*
   en sí, no solo el comando a mano → disparó puntual, log con timestamp
   correcto en hora Argentina. Línea de prueba retirada después; el
   crontab que quedó instalado es únicamente el de dos corridas diarias
   de arriba.

## Decisiones de diseño (por qué está así)

- **Sobrescribir, no acumular**: estas vistas son el estado actual
  (catálogo/KPI), no eventos — una fila repetida de corridas anteriores
  sería un dato viejo mintiendo como si fuera el de hoy.
- **`fetch` a la API de Sheets, no el SDK `googleapis`**: para "leer una
  vista y pisar una pestaña" un cliente HTTP alcanza — mismo criterio que
  ya se usó para Resend (`010-envio-email-autenticacion`), evitar una
  dependencia grande para un puñado de llamadas simples. Sí se usa
  `google-auth-library` para la autenticación de cuenta de servicio (la
  firma JWT no se reimplementa a mano).
- **Una falla no frena el resto**: cuatro reportes hoy, más después — que
  uno falle (p. ej. un error transitorio de red) no debe dejar a los
  demás desactualizados.
- **Rol `metabase_ro`**: este script nunca necesita escribir en Postgres;
  reusa la misma conexión de solo lectura que ya audita D21
  (`docs/decisiones-pendientes.md`) en vez de pedir una credencial nueva.

## Limitación conocida (primera versión)

Si `values:clear` tiene éxito pero la escritura posterior falla, la
pestaña queda en blanco hasta la próxima corrida exitosa (no hay
transacción que cubra las dos llamadas a la API de Sheets — Sheets no
ofrece eso). Documentado, no resuelto: ahora que corre sola por cron
(2x/día) esto es menos visible al toque que cuando se corría a mano — una
pestaña en blanco puede pasar hasta 12hs sin que nadie la note si no se
mira la planilla. Mitigación actual: el log (`sincronizar.log`) marca
`FALLÓ`/`exit≠0` esa corrida, así que revisar el log alcanza para
enterarse sin depender de mirar la planilla. Una alerta activa (mail,
Slack) si falla seguiría siendo trabajo futuro, no bloqueante hoy.

## Notas de Looker Studio al conectar la planilla

Aprendizajes de armar el dashboard sobre la planilla que sincroniza este
script — para no volver a perder tiempo en lo mismo la próxima vez que se
conecte una pestaña nueva.

1. **Una fuente de datos por pestaña, no una para todo el archivo.** Looker
   Studio conecta contra una hoja (tab) puntual de la planilla, no contra
   el archivo entero — cada pestaña nueva en `config.ts` necesita su
   propia fuente de datos nueva en Looker Studio (Recurso → Gestionar
   fuentes de datos → Agregar), no alcanza con la que ya existe para otra
   pestaña.
2. **Mapas: confirmar el campo Geo como "Subdivisión de país", y a veces
   hay que fijar el país.** Si el tipo no queda como "Subdivisión de
   país", Looker no sabe qué hacer con un código ISO 3166-2 y en algunos
   casos lo interpreta como EEUU por defecto (un código de provincia
   argentina resuelto como un estado de EEUU). Si fijar el tipo no
   alcanza, especificar el país de referencia en la configuración del
   campo geográfico lo resuelve.
3. **La métrica de un gráfico tiene que apuntar a la columna numérica
   real, no a "Recuento".** Cuando la vista ya trae un número
   precalculado por fila (p. ej. una cantidad), la métrica del gráfico
   debe ser esa columna con agregación `SUM` — dejar la agregación
   default en "Recuento" o "Recuento distintivo" cuenta filas, no suma el
   valor real, y da un número que parece plausible pero está mal.
4. **Color de "0" en un mapa: blanco, no gris.** Gris se confunde
   visualmente con "sin dato"/fuera de rango; blanco distingue mejor una
   provincia con valor cero de una que no tiene dato cargado.
5. **Si el tooltip del mapa muestra el código en vez del nombre:** cambiar
   la dimensión geográfica de la columna de código ISO a la columna de
   nombre resuelve esto de raíz (no hay una opción separada de "mostrar
   nombre" sobre la dimensión de código — hay que usar otra columna).
