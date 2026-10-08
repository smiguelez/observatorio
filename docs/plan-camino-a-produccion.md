# Plan de acción hacia producción — Observatorio de Oficinas Judiciales

> Documento vivo, iniciado el 2026-09-24. Consolida todo lo que quedó
> pendiente en `decisiones-pendientes.md`, `expectativas-nueva-app.md`, y
> las cuatro features cerradas (001-004, 006) más la que sigue en curso
> (005), en un orden de trabajo con dependencias explícitas — no una lista
> plana. Se actualiza a medida que cada fase se completa o cambia de
> alcance.

---

## Cómo leer este plan

Cada fase tiene un propósito único y depende de que la anterior esté
cerrada. Dentro de una fase, los ítems no tienen orden estricto entre sí
salvo que se indique. "Bloqueante" significa que sin eso, la fase completa
no puede darse por terminada — no que sea lo primero a tocar.

---

## Reglas operativas

Todo cambio a nivel sistema — `apt`/`apt-get`, `sudo`, edición de algo
bajo `/etc`, instalación o edición de un crontab — se registra en `docs/`
**en el momento**, con fecha, el comando exacto y el motivo. No alcanza
con que quede en el historial de la shell: tiene que quedar legible acá,
para quien herede el servidor. Un agente (humano o IA) que use `sudo`
como parte de una tarea lo informa explícitamente en su resumen final,
aunque la tarea en sí no haya sido sobre infraestructura.

---

## Fase A — Cerrar `007`: backend de identidad y autorización

**Por qué primero:** es la única fase que toca autenticación real — todo
lo demás (frontend, reporting, infraestructura) depende de que la
identidad y el control de acceso sean sólidos antes de exponer esto a
usuarios reales.

**Bloqueante — seguridad, no solo funcionalidad:**
- **D14**: rechazar altas de email no provisionado (opción 1 ya decidida)
  — hook de Better Auth que verifica contra `usuarios` antes de crear
  identidad.
- **D20**: restringir `PATCH /api/usuarios/:id` para que `provinciaId`
  solo lo escriba un admin — con `403` explícito ante el intento de un
  no-admin (no ignorar en silencio, decisión ya tomada).
- **G1**: endpoint para cambiar el rol de un usuario (admin únicamente).

**Bloqueante — funcionalidad ya prometida por el frontend:**
- **G3**: forma de fijar/cambiar contraseña desde el cliente (hoy
  `setPassword` es solo de servidor).
- Pantalla/endpoint de alta administrada de usuarios (consecuencia directa
  de D14 — si nadie puede autoprovisionarse, un admin tiene que poder
  darlos de alta).

**No bloqueante, pero mismo lote por tocar el mismo código:**
- Generalizar `esRechazoDeIntegridad` a los dos `500` encontrados en `005`
  (borrado de pool en uso, alta de UF con localidad inexistente) —
  mismo patrón ya resuelto en otros endpoints.
- Mensajes de trigger de taxonomía nombrando la pregunta por texto, no
  por id interno (FR-009 de `004`, hoy solo parcialmente cumplido).

**Explícitamente fuera de esta fase:**
- Envío real de email (Fase C, es infraestructura distinta).
- D13 (casing inconsistente) — ya decidido que se absorbe en el frontend,
  no se toca el backend por esto.

---

## Fase B — Frontend: cerrar lo que dependía de `007`

**Por qué después de A:** cada ítem de esta fase necesita un endpoint que
la Fase A construye.

- Pantalla de admin para asignar rol y provincia (hoy `US9` es de solo
  lectura). **✅ Hecho por `008` (2026-09-26)**: `/admin/usuarios` edita rol y provincia.
- Pantalla/flujo de alta administrada de usuarios. **✅ Hecho por `008`**: alta + enlace de acceso inicial + reemisión, y la pantalla pública `/primer-acceso` para el canje.
- Selector de provincia del perfil pasa a solo lectura; mensaje de alta
  sin provincia cambia a "pedile a un administrador". **✅ Hecho por `008`** (el admin sigue pudiendo editarla).
- Re-verificar SC-002 (recorrido de alta en una sola sesión) — el
  recorrido cambia porque un usuario nuevo ya no completa su provincia
  solo. **✅ Hecho por `008`**: SC-002 redefinido (parte de una persona dada de alta con provincia) y verificado de punta a punta.
- **T030**: probar Google de punta a punta — bloqueado por una credencial
  OAuth de desarrollo real, no por código (ver Fase E). **Sigue pendiente** (fuera de `008`).
- Borrado de pool en uso: el frontend traduce hoy el `500`/`23503` a
  `PoolEnUsoError` (`frontend/src/api/pools.ts`), lógica ahora obsoleta
  (D16); debe leer en su lugar el `400 { error, ... }` nuevo del backend —
  no probado todavía. **✅ Hecho por `008`**: `PoolEnUsoError` eliminado; se muestra el mensaje del `400`, verificado contra el backend real.
- CRUD de `organismo_fueros` — el listado de fueros concretos que asiste
  un organismo (D3: es lo que calcula `fuero_simplificado`). La app actual
  lo tiene (Sección 1 original, 1.2.1.4); `005-frontend-cliente` solo
  llegó a mostrar `fuero_simplificado` como dato de solo lectura, sin
  pantalla para editar el listado en sí — no dependía de la Fase A, a
  diferencia del resto de esta lista. **✅ Hecho por
  `011-crud-fueros-organismo` (2026-09-28)**: `PUT
  /api/organismos/:orgId/fuero` (reemplazo completo del listado, misma
  autorización que ya tenía el `GET`) y, en `DatosTab.tsx`, casillas sobre
  el catálogo real de fueros en lugar del texto fijo. Bloquea además con
  `400` sacar un fuero que una asignación de jueces ya acota
  específicamente (Principio VIII — el trigger existente no cubría ese
  caso). Backend 245/245, frontend 214/214, `tsc` limpio en ambos, y
  validado contra una instancia propia con evidencia real (capturas del
  resumen recalculado: un fuero → "multifuero" → sin fuero). El detector
  de relleno inicial (`detectar:fueros-sin-poblar`) confirma 0 organismos
  `cargado` con el listado vacío, antes y después de esta feature.

---

## Fase C — Infraestructura de email

**Por qué es su propia fase:** dos cosas separadas de esta lista dependen
de esto y ninguna se puede cerrar sin ella:
- **G4**: magic link enviado por correo real, no solo logueado en consola.
  **✅ RESUELTO de punta a punta por `010-envio-email-autenticacion`
  (2026-09-28)**: el magic link se envía vía Resend (antes solo se
  logueaba); además, dar de alta o reemitir un acceso inicial ahora puede
  enviarlo por email además de copiarlo a mano. Backend 237/237, frontend
  211/211, `tsc` limpio en ambos, 18 archivos de E2E corridos contra una
  instancia propia del backend (evidencia real, no mockeada) sin ninguna
  regresión atribuible a esta feature — y, con el dominio ya verificado
  (ver abajo), probado a mano contra la API real: un magic link real
  llegó a un inbox de Gmail sin caer en spam, y un acceso inicial enviado
  por email también llegó.
- Aviso de aprobación, si alguna vez se construye el ítem 9 del backlog
  (solicitud de acceso) — no es indispensable ahora, pero magic link sí lo
  es para cualquier uso real del sistema.

Proveedor de envío ya decidido: Resend, capa gratuita (`010-envio-email-autenticacion`).

**Bloqueante — gestión externa, no código.** Resend exige un dominio
propio verificado desde el primer envío real — no hay volumen que lo
evite; el dominio de prueba (`onboarding@resend.dev`) solo puede entregar
al email del dueño de la cuenta de Resend, nunca a un usuario real (`010`,
research.md, Decisión 1). Verificarlo implicaba conseguir acceso
administrativo a la cuenta de Cloudflare de `jufejus.org.ar` (ya delegada
ahí, confirmado) para cargar los registros que Resend pidiera — el mismo
acceso que también hace falta más adelante para el subdominio de la app
(Fase E, D5) y para el dominio final de las credenciales OAuth de Google
(Fase E).

**✅ RESUELTO (2026-09-28): `send.jufejus.org.ar` verificado en Resend**
(región `sa-east-1`, plan **Resend Forge** — en la práctica, 1 TXT de DKIM
+ 2 CNAME hacia `forge.rmta.net`, cargados en Cloudflare en modo "DNS
only"/sin proxy; el estimado original de este documento, MX + SPF + DKIM,
era una aproximación genérica que no coincidió con lo que pidió la cuenta
real — corregido en `010/research.md`, Decisión 1). Confirmado de punta a
punta a mano: magic link real recibido en un inbox de Gmail sin caer en
spam, y acceso inicial por email también recibido.

**A tener en cuenta antes del corte real (no bloqueante para seguir
desarrollando, pero sí para producción):**
- La cuenta de Resend quedó registrada con el correo institucional del
  administrador del dominio (`jufejus.org.ar`) — la debilidad no es que
  sea una casilla privada, sino que el acceso depende de una sola persona.
- El plan gratuito admite **un solo miembro** en la cuenta y un tope de
  **100 emails por día** — suficiente para desarrollo y para el volumen
  esperado hoy (menos de 50 usuarios, altas esporádicas), pero antes del
  corte real conviene sumarle acceso compartido a más de una persona (el
  plan gratuito no lo permite) y revisar si ese tope diario sigue
  alcanzando.

---

## Fase D — Reporting (la cuarta feature original, sin empezar)

**D2**, nunca abordada: qué reemplaza a Looker Studio y al pipeline hacia
BigQuery. Es su propio ciclo `specify → plan → tasks → implement`, como
las anteriores — no depende de A, B, o C, así que puede *empezarse* en
paralelo con ellas si hay capacidad, pero no es parte de "cerrar la
migración de datos y autenticación".

**No es una tarea sin apuro: es un bloqueante de la Fase F.** Los
tableros de DataStudio/Looker Studio que la app ya enlaza (research.md de
005, Decisión 7 — el ítem "Tableros" del menú) leen hoy de un pipeline
hacia Firestore. Ese pipeline deja de tener datos el mismo día que Fase F
apaga Firestore (ver runbook). Por eso el pipeline nuevo desde
PostgreSQL — y su migración de tableros — **debe estar resuelto antes de
ejecutar la Fase F**, aunque el trabajo pueda arrancar en paralelo con
A/B/C. No alcanza con "correr en paralelo si hay capacidad": si para el
corte no está listo, es una regresión visible (tableros existentes sin
datos) el mismo día del corte, no un backlog pendiente.

**Metabase: CONFIRMADO VIABLE para el Observatorio (2026-09-30).** Tablas,
distribuciones por provincia y por fuero, y el mapa geográfico por
provincia funcionando — con CABA incluida, usando
`provincias-completo.geojson` (repo `observatorio-assets`). Historial del
mapa, para no perder el porqué:

- Un primer intento —cargar el GeoJSON servido por un HTTP local en
  `:8088`, confirmado respondiendo `200 OK` con `curl` desde el propio
  servidor— falló: Metabase no logró leerlo por ningún camino probado
  (`localhost`, `127.0.0.1`, la IP interna del contenedor). Causa raíz
  confirmada: el filtro de seguridad de Metabase bloquea cualquier
  variante de acceso a la propia máquina, no solo `localhost`/`127.0.0.1`
  literales.
- Solución: servir el GeoJSON desde un dominio público real
  (`raw.githubusercontent.com`) en vez de un servidor local. El archivo
  final usado es `provincias-completo.geojson` (con CABA), no el
  `provincias-sin-antartida.geojson` del intento anterior — ambos
  recortados del reclamo antártico a partir de la fuente
  `NickCis/argentina-provincias-geojson.js`.
- El mapeo entre el id numérico de ese archivo (p. ej. `"06"` para Buenos
  Aires) y `provincias.codigo_iso` (ISO 3166-2, p. ej. `AR-B`) ya cargada
  en la base quedó resuelto — el mapa ya funciona con datos reales.

**Pendiente, no bloqueante:** zoom interactivo sobre CABA en el mapa (por
su tamaño en el mapa del país completo).

**Lo que falta antes de migrar en serio:** **D2** sigue sin resolverse,
pero ya no es un punto ciego — `docs/inventario-tableros-actuales.md`
(2026-09-30) documenta los 4 dashboards que existen hoy en Looker Studio.
Ese inventario es solo **descriptivo**: registra qué se ve en cada
tablero, no cómo se arma. Confirmar que Metabase sirve, más este
inventario, todavía no alcanza para migrar — siguen sin definir la
consulta SQL exacta detrás de cada visualización y la prioridad de
migración (qué tablero va primero).

---

## Fase E — Infraestructura de producción real

**Por qué después de A-C, no antes:** no tiene sentido resolver dónde y
cómo se despliega algo que todavía va a cambiar de forma (Fase A cambia
endpoints de auth, Fase B cambia pantallas).

- **D5**: decisiones de despliegue — Cloudflare Tunnel o no, dónde vive el
  frontend en producción (¿el mismo `foros-ubuntu`, u otro servidor?). Mismo
  acceso a la cuenta de Cloudflare de `jufejus.org.ar` que ya hace falta
  antes, en Fase C, para verificar el dominio de envío de Resend — si se
  consigue ese acceso para Fase C, ya está disponible acá también.
- Lista de requerimientos al proveedor de infraestructura: formalizada
  (2026-10-07) en la subsección de abajo — ya no es un pendiente sin
  escribir.
- Gestión de procesos real — hoy backend y frontend corren con `tsx watch`
  / `vite dev`, modo desarrollo; producción necesita `systemd` o
  equivalente, con reinicio automático ante caída. Ver pedido 4, abajo.

### Pedido al proveedor de infraestructura

Hechos verificados el 2026-10-07 sobre el servidor de desarrollo actual
(`foros-ubuntu`):

- **Supervisión de procesos.** El contenedor es Docker; PID 1 es `sshd`,
  sin supervisor ni `systemd`. Backend, frontend, el túnel de Cloudflare y
  la sesión de cron corren en `tmux` o a mano — si el contenedor se
  reinicia, nada los vuelve a levantar. (El crontab de reportes, 6:00 y
  12:00, sí funciona mientras el contenedor sigue arriba — ver
  `docs/runbook-reportes-sheets.md`.)
- **Disco.** `/` es un overlay de 24 GB, al 100% (22,9 GiB usados, 230 MiB
  libres). El 2026-09-29 estaba al 95%, con ~1,2 GB libres — se agotó en
  poco más de una semana. Desde adentro del contenedor, `du -x /` solo
  explica 1,2 GB (911 MB el 29/9): `/var/log` pesa 1,4 MB, `/tmp` 43 MB,
  sin archivos borrados retenidos por ningún proceso. Quedan **~21,7 GiB
  sin explicar** — que los esté usando otro contenedor o el host mismo es
  una inferencia razonable, no algo confirmado desde adentro.
- **Postgres sobre el mismo overlay.** El directorio de datos
  (`/var/lib/postgresql/16/main`) pesa 67 MB; la base en sí, 11 MB —
  chico hoy, pero vive en el mismo disco al 100% de arriba.
- **`/home`** es un volumen aparte, 50 GB, 11 GB libres. No se sabe si
  persiste si el contenedor se recrea (no solo se reinicia).
- **Hay un backup**, `~/backups/observatorio-2026-10-07.dump` (158 KB,
  índice legible con `pg_restore -l`, restauración completa NO probada
  todavía). No está versionado — contiene datos reales (Principio
  XIII/D15).
- `pg_hba.conf` venía en `trust` desde el aprovisionamiento inicial del
  servidor (corregido acá el 2026-09-29, D21).

**Pedidos — 1 a 5 son URGENTES (riesgo real de caída hoy), 6 y 7 son
previos al corte de Fase F, no urgentes hoy:**

1. **[URGENTE]** Identificar qué consume el espacio de `/` (los ~21,7 GiB
   sin explicar desde adentro del contenedor) y liberarlo.
2. **[URGENTE]** Cuota de disco garantizada para este contenedor — hoy
   puede quedarse sin espacio por algo ajeno a esta aplicación.
3. **[URGENTE]** Confirmar qué persiste si el contenedor se reinicia o se
   recrea — tanto `/` como `/home` — hoy no se sabe.
4. **[URGENTE]** Supervisión de procesos con reinicio automático
   (entrypoint con `supervisord`/`s6`, o contenedores separados con
   `restart: unless-stopped`), incluido el cron de reportes.
5. **[URGENTE]** Backups: snapshots del volumen y de la base, frecuencia,
   retención y una prueba de restauración real (no solo el índice
   legible); mover el directorio de datos de Postgres a un volumen
   persistente, fuera del overlay de `/`.
6. Mecanismo para inyectar secretos por entorno
   (`BETTER_AUTH_SECRET`, `DATABASE_URL`, `RESEND_API_KEY`, credenciales
   de Google) sin dejarlos en el repo — ver también el punto de secretos
   por entorno ya listado abajo.
7. Confirmar que la imagen de producción no hereda `pg_hba.conf` en
   `trust` (ver hecho verificado arriba — ya pasó una vez en este
   servidor de desarrollo).

**Nota — instalación de paquetes del 2026-10-05, no relacionada con el
problema de disco de arriba:** a las 22:47, para poder correr los tests
E2E de un fix de UI contra un navegador real, se instalaron con `sudo
apt-get install` 87 paquetes de sistema (`libnspr4`, `libnss3`,
`libasound2t64` y las dependencias gráficas de Chromium para Playwright:
`xvfb`, fuentes, librerías gráficas), ~360 MB en `/usr`. Son necesarios
para correr E2E en este servidor de **desarrollo** y **no deben estar en
la imagen de producción** — los E2E corren en un entorno aparte, nunca en
el servidor que sirve tráfico real. Esta instalación es ~360 MB; el
espacio sin explicar de arriba es ~21,7 GiB — no es la causa del problema
de disco, se anota acá solo por la regla operativa de dejar registrado
todo cambio a nivel sistema (ver arriba).

- Credenciales OAuth de Google **reales**, de producción, con el dominio
  final registrado como `redirect_uri` — resuelve T030 de la Fase B de
  paso, si se consigue una de desarrollo antes, mejor.
- Separación de secretos por entorno: `BETTER_AUTH_SECRET`,
  `DATABASE_URL`, credenciales de Google — desarrollo vs. producción,
  nunca el mismo valor.
- **D10**: decidir si el rate limiting de login pasa de SHOULD a MUST
  antes del corte real (la propia constitution ya preveía esta revisión).
- Estrategia de backup de PostgreSQL en producción (no discutida todavía).
- Reescritura del historial de git para sacar los datos reales que
  quedaron en dos commits viejos (D15/D19) — sesión dedicada, aparte de
  cualquier otra tarea, con el checklist que ya quedó escrito en D15
  (confirmar alcance en todas las ramas, avisar a clones existentes,
  verificar con `git grep` al final).

---

## Fase F — Corte a producción

**Prerrequisito, no solo A-C:** la Fase D (pipeline de reporting desde
PostgreSQL) tiene que estar resuelta antes de este punto — el runbook
apaga Firestore, y los tableros existentes leen de un pipeline que
depende de Firestore hoy.

Ejecutar `docs/runbook-corte-produccion.md`, ya escrito: congelar
Firestore, export fresco, ambiente reproducible, detección de anomalías
conocidas, reconciliación como gate, merge de `reformulacion` a `main`,
encender la app nueva.

### Día de la baja de la app vieja — lista de tareas

**Prerrequisitos** (sin esto, no se empieza):

- Fase D completa — los 4 tableros migrados y en uso de verdad, no solo
  técnicamente posible.
- Fases E y F cerradas (infraestructura real con supervisión/backups, y
  el propio corte ejecutado — ver arriba).
- Login con Google funcionando en la app nueva con un cliente OAuth del
  **proyecto institucional** (`forojufejus@gmail.com`), no uno de
  desarrollo ni de una cuenta personal.

**Tareas, en este orden:**

1. Congelar escrituras en Firestore, export final y reconciliación —
   `docs/runbook-corte-produccion.md`.
2. Cambiar el DNS de `observatorio.jufejus.org.ar` al túnel nombrado.
3. Verificar los tres métodos de login en producción (contraseña, Google,
   enlace mágico) contra el dominio real.
4. Guardar una copia del snapshot de Firestore y de BigQuery **fuera**
   del servidor y **fuera** de git — contienen datos reales (Principio
   XIII/D15).
5. Apagar sin borrar, en el proyecto viejo: Firestore, Firebase Auth, el
   pipeline Firestore → BigQuery, las tablas de BigQuery, y cualquier
   función o scheduler que quede. Esperar un período de gracia y
   verificar que nada falle antes de borrar nada.
6. Revocar credenciales viejas: claves de cuentas de servicio, clientes
   OAuth y tokens del proyecto viejo.
7. Dar de baja el proyecto de la app vieja en Vercel.

**NO dar de baja** (sigue en uso por la app nueva o por reporting):

- El proyecto de GCP de reporting (API de Sheets, cuenta de servicio
  `observatorio-reporting-sheets`).
- El cliente OAuth del login de la app nueva.
- Looker Studio, Google Sheets, ni el Google Workspace del dominio.

**Antes de dar de baja nada de una cuenta personal**: verificar quién es
el titular de los reportes de Looker Studio existentes y, si los creó la
cuenta personal (no la institucional), transferirlos a
`forojufejus@gmail.com` antes de tocar esa cuenta — de lo contrario los
reportes se pierden junto con la cuenta.

---

## Lo que NO entra en este plan (backlog, post-corte)

Los 9 ítems de `docs/expectativas-nueva-app.md` — rol
`supervisor_provincial`, taxonomía para tipos sin preguntas, log de
auditoría, campos de plantilla/personal, administración de taxonomía
desde la UI, ampliar tipos de UF, link a normativa, digesto de IA,
solicitud de acceso con aprobación. Se procesan después del corte, cada
uno como su propia feature-spec cuando corresponda.

---

## Historial

- **2026-09-24:** plan creado, consolidando D9-D20, G1-G6, y las cuatro
  fases originales del proyecto (modelo de datos cerrado, backend cerrado
  con ajustes pendientes en 007, frontend en cierre, reporting sin
  empezar).
- **2026-10-07:** agregadas las "Reglas operativas" (registro de todo
  cambio a nivel sistema); formalizado en Fase E el "Pedido al proveedor
  de infraestructura" (7 pedidos a partir de hechos verificados ese día —
  disco al 100% con ~21,7 GiB sin explicar, sin supervisión de procesos,
  sin confirmar qué persiste ante un reinicio/recreación del contenedor —
  los primeros 5 marcados URGENTES); y agregada en Fase F la lista de
  tareas para el día de la baja de la app vieja, con sus prerrequisitos y
  qué NO se da de baja.
