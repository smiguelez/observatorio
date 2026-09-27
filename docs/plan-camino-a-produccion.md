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

---

## Fase C — Infraestructura de email

**Por qué es su propia fase:** dos cosas separadas de esta lista dependen
de esto y ninguna se puede cerrar sin ella:
- **G4**: magic link enviado por correo real, no solo logueado en consola.
- Aviso de aprobación, si alguna vez se construye el ítem 9 del backlog
  (solicitud de acceso) — no es indispensable ahora, pero magic link sí lo
  es para cualquier uso real del sistema.

Decisión pendiente: proveedor de envío (SMTP propio, servicio gestionado
tipo SES/Postmark/Resend) — a evaluar con criterio de costo y volumen (47
usuarios hoy, no un envío masivo).

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

---

## Fase E — Infraestructura de producción real

**Por qué después de A-C, no antes:** no tiene sentido resolver dónde y
cómo se despliega algo que todavía va a cambiar de forma (Fase A cambia
endpoints de auth, Fase B cambia pantallas).

- **D5**: decisiones de despliegue — Cloudflare Tunnel o no, dónde vive el
  frontend en producción (¿el mismo `foros-ubuntu`, u otro servidor?).
- Lista de requerimientos al proveedor de infraestructura (mencionada al
  principio del proyecto, nunca formalizada).
- Gestión de procesos real — hoy backend y frontend corren con `tsx watch`
  / `vite dev`, modo desarrollo; producción necesita `systemd` o
  equivalente, con reinicio automático ante caída.
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
