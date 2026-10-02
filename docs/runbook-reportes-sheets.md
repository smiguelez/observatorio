# Runbook: sincronización Postgres → Google Sheets (reporting, Fase D)

> Ayuda memoria para agregar un reporte nuevo sin depender de releer esta
> sesión. El código vive en `backend/scripts/reportes-sheets/`.

## Qué es y qué no es

Un script que lee vistas de Postgres (solo lectura, rol `metabase_ro`) y
**sobrescribe por completo** cada una en su propia pestaña de una planilla
de Google Sheets real. Cada corrida reemplaza el contenido entero de la
pestaña — no va acumulando filas. Sirve para vistas de **catálogo/KPI**
(el estado actual), no para un historial que deba crecer con el tiempo.

No configura ningún cron todavía (primera versión, corrida a mano) y no
decide qué vistas existen — eso lo hace la migración de Postgres
correspondiente (`backend/migrations/`).

## Piezas, qué hace cada una

| Archivo | Rol |
|---|---|
| `config.ts` | El mapeo `vista SQL -> pestaña`. **El único archivo que se toca para agregar un reporte.** |
| `postgres.ts` | `leerVista(pool, nombreVista)` — lee una vista completa, en el orden de columnas de la vista (no alfabético). |
| `sheets.ts` | `obtenerTokenSheets`, `asegurarHoja` (crea la pestaña si no existe), `sobrescribirHoja` (limpia + escribe). Único módulo que habla con la API de Sheets — un `fetch` a la API v4, sin el SDK `googleapis` completo (mismo criterio que `src/email/resend.ts` para Resend). |
| `sincronizar.ts` | El script principal: recorre `config.ts`, sincroniza cada reporte, una falla no frena a los demás, reporta al final. |

## Cómo agregar un reporte nuevo (de punta a punta)

1. **Crear la vista SQL** — una migración nueva en `backend/migrations/`
   (mismo patrón que `0005_vistas_reporting_dashboard1.ts`: `CREATE VIEW`
   vía Kysely + `sql` tag, con `up`/`down`, documentando en el comentario
   de dónde sale cada columna y qué reemplaza del dashboard original).
   Correrla con `npm run migrate:public`.
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
ofrece eso). Documentado, no resuelto: aceptable para una primera versión
corrida a mano: se nota de inmediato al mirar la planilla.
