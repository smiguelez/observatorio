# Decisiones pendientes — proyecto de reformulación del Observatorio

> Estas decisiones no son principios de constitution: son decisiones de
> modelado o de infraestructura que corresponden a la spec específica donde
> se necesitan. Se listan acá para no perderlas mientras se resuelven.

---

**D1 — Autenticación: RESUELTA (2026-09).**
La app soportará usuario/contraseña propio, Google Sign-In, y otros métodos a
evaluar. Ver Principios III, IV y V de la constitution.

*Queda abierto dentro de esta decisión:* qué métodos adicionales se evalúan
además de los dos confirmados, y con qué prioridad. No bloquea el diseño del
backend — el modelo de identidad ya está definido para soportar métodos
nuevos sin reescritura.

---

**D2 — ¿Qué reemplaza a Looker Studio y al pipeline hacia BigQuery?**
No se puede decidir hasta saber qué hay: el mecanismo de exportación, las
vistas y qué dashboard consume cada una son puntos ciegos (auditoría §4, §8).
No bloquea el modelo de datos ni el backend, pero sí la spec de reporting —
es la cuarta feature en la secuencia, no la primera.

---

**D3 — `fuero_simplificado`: RESUELTA (2026-09).**
Deja de ser un campo cargado a mano: el modelo nuevo incorpora un listado de
fueros que el organismo asiste (relación organismo↔fuero, cardinalidad
múltiple), y `fuero_simplificado` pasa a ser un **campo calculado** a partir
de ese listado — "multifuero" cuando hay más de uno seleccionado. Al ser
calculado, sigue disponible para consumo desde Data Studio sin cambios en esa
punta (resuelve el impacto en reporting que se había señalado).

*Migración de los datos existentes:* los organismos que hoy están vacíos en
`fuero_simplificado` quedan sin fueros asignados tras la migración; la carga
real se completa después, por gestión con los referentes provinciales — esto
no bloquea el resto del proyecto.

*Punto de confirmación cerrado (2026-09):* se usan dos valores de migración
distintos, no uno solo —

- `sin_fueros_asignados` — para los vacíos reales (dato faltante o
  administrativo genuino).
- `multifuero_sin_detalle` — para los 20 que hoy dicen "multifuero" (confirmado
  por verificación del 2026-09-07; la cifra de 14 era una estimación de
  `SPEC.md` de julio, ya desactualizada): preserva
  el hecho conocido de que asisten a más de un fuero, sin inventar cuáles.

Motivo: fusionarlos habría perdido un dato ya conocido y hecho que reportes de
"organismos sin asistencia a ningún fuero" incluyeran, mientras dura la carga
pendiente, a 20 organismos que en realidad asisten a varios.

*Sigue abierto, no bloquea nada:* dónde vive el cálculo de
`fuero_simplificado` (columna generada de Postgres, cálculo en backend, o
vista) — es decisión de `/speckit-plan`, no de la spec.

---

**D4 — Clave primaria de usuarios, ahora con múltiples métodos de login.**
Hoy el email es el id del documento y también la referencia de ownership en
`organismos.usuario_google` y `organismos.editores[]`. Con dos o más métodos
de autenticación coexistiendo, mantener el email como clave primaria es más
frágil que antes — un mismo usuario puede tener el mismo email verificado por
distintos proveedores, y un id subrogado interno (serial o UUID) con el email
como columna `unique` separa mejor "quién es el usuario" de "cómo probó
quién es".

*Resultado de V1.1 (2026-09):* 0 colisiones de email por casing en los datos
actuales — 46 de 46 ids son emails válidos en minúscula, sin mismatches
contra el campo `email`. La recomendación de id subrogado ya no se apoya en
limpieza de datos existentes (no hay nada que limpiar): es una decisión de
diseño hacia adelante, motivada por Principio V (identidad unificada), no por
un problema encontrado en los datos.

---

**D5 — Infraestructura de despliegue.**
El servidor está en un data center, pero no está definido si Cloudflare
Tunnel forma parte de la topología nueva, ni cómo se despliega el frontend
(¿sigue en Vercel? ¿pasa al servidor propio?). No bloquea el modelo de datos;
sí bloquea las specs de backend y frontend.

---

**D6 — Tercer estado para UF sin jueces asignados: RESUELTA (2026-09).**
El modelo actual asume que toda UF está en modo "cantidad directa"
(`jueces_asistidos` poblado) o modo "pool" (`pool_jueces_id` poblado),
mutuamente excluyentes. La verificación V3.3 encontró 2 UF (de 277) sin
ninguno de los dos poblados — identificadas como la única UF de organismos
puramente administrativos ("Secretaria de gestión administrativa", "Oficina
de Gestión Digital"), confirmado por Santi.

No es dato faltante: es un caso legítimo que el modelo original no
contemplaba. El modelo relacional agrega un tercer estado explícito —
`no_aplica` (o equivalente) — junto a cantidad directa y pool, para UF de
organismos sin jueces asignados por diseño.

---

**D7 — `anio_implementacion`: RESUELTA (2026-09).**
V3.7 encontró texto libre real, no solo años: fechas completas
(`"1/7/2021"`), texto descriptivo (`"2015. Refuncionalización 2024"`), un
valor sin sentido como año (`"9"`), y una cadena vacía — 14 casos de 277 UF
con formato no estándar, más 1 completamente ausente.

Solo interesa guardar el año — no el texto original. Una sola columna:
`anio_implementacion` (integer, nullable). Regla de extracción: donde el
valor contiene una fecha completa, se extrae el año (`"1/7/2021"` → 2021);
donde no hay ningún año identificable (`"9"`, cadena vacía), queda `null`.

*Caso ambiguo resuelto:* `"2015. Refuncionalización 2024"` → **2015** (año de
implementación original, no el de la refuncionalización posterior).

---

**D8 — Relación UF↔jueces es más rica que "tres estados excluyentes" (2026-09).**
`FR-018` y `schema.sql` (ya generados por `/speckit-plan`) modelan la relación
UF↔jueces como tres estados excluyentes: cantidad directa, un pool, o
no_aplica. Santi identificó cinco casos reales que ese modelo no cubre:

1. UF con N jueces exclusivos, no compartidos (cubierto — caso "cantidad
   directa" actual).
2. Varias UF que comparten el mismo pool de jueces (cubierto — caso "pool"
   actual).
3. Una UF que asiste a **dos pools distintos** a la vez — **no cubierto**
   (el modelo actual permite un solo `pool_jueces_id` por UF).
4. Una UF que asiste a más de un pool **más** un grupo propio no compartido
   con nadie — **no cubierto**.
5. UF que asiste a un **subconjunto** de un pool, mientras otras UF asisten
   al pool completo — **no cubierto**, y es el más difícil: requiere saber
   qué jueces individuales integran el subconjunto, no solo cuántos.

*Fuente:* conocimiento de dominio de Santi, no un patrón encontrado en los
datos verificados — ninguna verificación detectó jueces individuales por
nombre en Firestore, solo conteos o referencias a pool completo.

*Dos caminos evaluados:*
- **(a) Jueces como entidad individual** + tabla puente UF↔juez. Resuelve
  los 5 casos con exactitud, incluido el subconjunto arbitrario del caso 5.
  Costo: carga de datos nueva (jueces por nombre), no existe hoy.
- **(b) Tabla puente `unidad_funcional_pool(uf_id, pool_id,
  cantidad_asignada)`**, sin discriminador de tres estados. El caso 1 se
  modela como pool de un solo miembro. Resuelve 1–4 con precisión; el caso 5
  queda aproximado por cantidad, sin identificar jueces específicos.

**Confirmado por Santi (2026-09):** opción (b) — no hace falta saber cuáles
jueces, alcanza con cuántos. Cada operador carga, por UF, la cantidad de
jueces a la que asiste; los pools existen para poder referenciar con
claridad un mismo grupo desde varias UF al seleccionarlo.

*Regla real de conteo (confirmada con ejemplo de Santi, 2026-09):* no son dos
reglas de integridad de datos — es una sola regla de **cómo se calcula cada
consulta**, según su granularidad:

- **Por UF (individual):** se suma todo lo asignado a esa UF, sin
  deduplicar — exclusivos + cada pool completo o parcial al que accede.
- **Agregado (por localidad, provincia, fuero, etc.):** se cuenta cada
  **grupo** (pool o grupo exclusivo) **una sola vez**, usando el total real
  del grupo — nunca sumando las cantidades por-UF de ese grupo.

*Ejemplo que fija el criterio:* UF1 tiene 5 jueces exclusivos, accede al pool
A completo (5 jueces, compartido con UF2) y a un subconjunto de 3 del pool B
(10 jueces, al que UF3 accede completo). Por UF: UF1 = 13 (5+5+3), UF2 = 5,
UF3 = 10 — suma total 28. Agregado: 5 (exclusivo) + 5 (pool A) + 10 (pool B)
= 20 — el subconjunto de 3 que toma UF1 del pool B **no se suma además**,
porque esos 3 jueces ya están dentro de los 10 del pool B.

No hace falta ninguna restricción que valide que los subconjuntos sumen menos
que el total del pool — los subconjuntos y el acceso completo al mismo pool
se **solapan a propósito** (UF1 ve 3 de los mismos 10 que UF3 ve completos),
no se reparten en porciones disjuntas.

**Fuero por asignación, no por UF ni por pool (RESUELTO, 2026-09).** Confirmado
por Santi: hay pools compartidos entre UF de distinto fuero, y el caso extremo
es un subconjunto de un pool que en la UF de origen tiene tres fueros pero ese
subconjunto específico solo se dedica a dos de ellos.

El fuero no es un atributo fijo de la UF ni del pool — es un atributo de la
**asignación** (la fila de la tabla puente UF↔grupo). Por defecto, una
asignación hereda los fueros de la UF completa; se puede acotar explícitamente
cuando ese subconjunto específico atiende menos fueros que la UF en general.

*Restricción:* los fueros declarados en una asignación no pueden exceder los
fueros de la UF que la origina.

*Consecuencia en la agregación por fuero:* se suma por **asignación**, no por
UF completa — cada fila UF↔grupo aporta su cantidad al fuero (o fueros) que
esa fila específica declara.

**Límite de alcance a partir de acá:** esta es la segunda ampliación de
`FR-018`/el modelo UF↔jueces en esta misma sesión de `/speckit-plan`. Entra
en esta corrección junto con D8 porque toca la misma tabla puente. Cualquier
refinamiento adicional que surja después de esta corrección queda para una
revisión posterior de la feature, no para una tercera reapertura del mismo
ciclo specify→plan.

**Impacto en el trabajo ya hecho:** invalida parte de `FR-018` (spec.md) y el
diseño de `modo_jueces` en `contracts/schema.sql` (plan.md) tal como quedaron
generados. Requiere reabrir `/speckit-specify` para corregir el requisito
funcional antes de tocar el plan de nuevo — no es un ajuste de solo
implementación.

---

**D9 — Código de migración no implementa aún el frenado por confirmación humana que exige el runbook (2026-09-18).**

Al escribir `migration/README.md` (T033), se encontró que ninguna de las tres
anomalías conocidas (D-15, D-16, D-17) está implementada tal como
`docs/runbook-corte-produccion.md` exige para el corte real (detectar y
frenar para confirmación humana, no auto-resolver):

- `jueces_asistidos="0"` (D-16): generaliza por valor, pero resuelve
  automáticamente sin frenar.
- Coordenadas de localidad (D-15) y código de taxonomía inválido (D-17):
  hardcodeados por `firestore_id` puntual — frenan ante un documento nuevo
  con el mismo problema, pero reaplican en silencio si reaparece el mismo
  documento.

**No bloquea nada de esta feature ni de la migración de prueba ya hecha** —
queda documentado en `migration/README.md` (sección "Anomalías conocidas") y
acá como recordatorio para cuando se retome el proyecto de cara al corte
real: ajustar `transform/localidades.js`, `transform/asignaciones-jueces.js`
y `transform/taxonomia.js` para que las tres anomalías siempre frenen y
esperen confirmación, sin excepción por "ya visto antes".

---

**D10 — Rate limiting de login fallido (`002-backend-api-carga-datos`, T038): NO implementado en esta feature.**

Confirmado contra el código real, no asumido: `grep -rn "rateLimit" backend/src`
no encuentra ninguna referencia — no hay ningún archivo
`backend/src/auth/rate-limit.ts` ni configuración `rateLimit` en
`backend/src/auth/index.ts`. La instancia de Better Auth se creó sin la
opción `rateLimit`.

Better Auth trae un rate limiter genérico propio, pero **no cubre esto por
default**: su documentación de tipos dice explícitamente "by default, rate
limiting is only enabled on production" (`@better-auth/core`,
`BetterAuthRateLimitOptions.enabled`) — nunca corrió con `NODE_ENV=production`
en esta feature, así que estuvo desactivado en todas las corridas y tests.
Aun si se activara, su default (ventana de 10s / máximo 100 requests por IP)
es un throttle genérico de la ruta, no "intentos de login fallidos **por
cuenta**" como pide el Principio IV — para eso hace falta una regla
específica (`customRules`) que esta feature no configuró.

Es una omisión reconocida, no un olvido silencioso: el Principio IV ya deja
esto en **SHOULD para v1**, con intención explícita registrada ahí mismo de
"endurecerlo a MUST en una revisión posterior de esta constitution". Esta
entrada es esa deuda, para que la revisión posterior la encuentre acá y no
tenga que volver a auditar el código para descubrirlo.

*No bloquea el cierre de la feature* (SHOULD, no MUST) — sí bloquea marcar
T038 como completo en `tasks.md`; queda registrado como "no implementado",
no como "hecho".

---

**D11 — Endpoint de taxonomía roto por la migración de esquema de 003 (2026-09-22).**

`PUT /api/organismos/:orgId/taxonomia` (feature `002-backend-api-carga-datos`)
falla con error de columna inexistente desde que se aplicó la migración
`0001_taxonomia_parametrizable` de `003-taxonomia-parametrizable`
(`evaluaciones_taxonomicas` dejó de tener las 9 columnas fijas que ese
endpoint asume). `GET` en la misma ruta no tira error, pero devuelve una
forma de datos incorrecta (`rows[0]`, de cuando la tabla tenía una fila por
organismo; ahora tiene varias filas por organismo).

*Por qué no se detectó antes:* no existe `taxonomia.test.ts` en la suite de
`002-backend-api-carga-datos` — nunca hubo cobertura de test para este
endpoint, desde su creación. El punto ciego es anterior a la feature 003;
recién se hizo visible al verificar el Independent Test de US3 de esa
feature.

*No bloquea el cierre de `003`* (fuera de su alcance declarado: modelo de
datos, no API) — **sí bloquea cualquier uso real de la app antes del corte
a producción**, dado que no hay despliegue real afectado hoy (la app en
producción sigue siendo la vieja, sin tocar). Se resuelve como parte del
trabajo de backend sobre taxonomía (feature futura o fast-follow inmediato
a continuación de 003), con su propio test — no se corrige dentro de 003.

---

**D13 — Casing inconsistente entre endpoints de backend (2026-09-23).**

Al planificar `005-frontend-cliente`, se encontró que las respuestas de la
API no usan una convención uniforme: `snake_case` en organismos, usuarios y
pools (`002-backend-api-carga-datos`); `camelCase` en asignaciones,
editores, fuero y taxonomía (`006-backend-endpoints-faltantes`). Cada
feature se implementó sin mirar la convención de las anteriores.

**Decisión de Santi:** no tocar el backend — las cuatro features que
introdujeron la inconsistencia ya están cerradas, testeadas, y en
`reformulacion`. El frontend absorbe la diferencia con una capa de mapeo
por recurso, normalizando cada respuesta a un solo casing interno del
cliente.

**Deuda registrada para el futuro:** el día que otro cliente distinto al
frontend (por ejemplo, el "digesto" de IA del backlog) consuma esta misma
API, va a tropezar con la misma inconsistencia. Si en algún momento se
justifica una pasada de normalización sobre el backend, es una feature
propia — no se resuelve de pasada dentro de ninguna otra.

---

**D14 — Alta de usuarios sin control administrativo: gap de seguridad, resuelto por diseño (2026-09-24): RESUELTA (2026-09-25).**


Hasta `007`, cualquiera podía crear una cuenta por contraseña (ruta de Better Auth
expuesta), Google, o magic link con cualquier email — no había ningún
control de "solo un admin crea usuarios" a nivel de backend, pese a que
esa es la intención declarada del sistema (Santi, `005-frontend-cliente`).
El frontend no ofrecer una pantalla de registro NO cierra esta puerta,
porque la API sigue aceptando altas directas.

**Decisión (opción 1, confirmada por Santi):** el intento de ingreso de un
email no provisionado por un admin se **rechaza** — un hook de Better Auth
(mismo mecanismo ya usado para fijar `auth.user.id`, `002-backend-api-carga-datos`
Decisión 3) verifica si el email existe en `usuarios` antes de permitir la
creación de identidad; si no existe, aborta con un mensaje claro. Se
resuelve en `007`, antes que cambio de rol o fijar contraseña — es la
primera prioridad de esa feature.

**Descartada por ahora, no por inviable — a backlog (opción 2):** en vez
de un simple rechazo, ofrecer un formulario de "solicitud de acceso"
(email + provincia) que un admin revisa y aprueba. Evaluado como
demasiado costoso para el volumen actual (47 usuarios en todo el
sistema): requiere una tabla nueva, tres endpoints con su propia
autorización, la primera pantalla **pública sin autenticación** de toda la
app (con las preocupaciones de spam/rate-limiting que eso conlleva), y —
el costo más grande — infraestructura real de envío de email para avisar
la aprobación, que hoy no existe (ni siquiera el magic link envía correo
real, solo lo loguea en consola). No se pierde nada por construir la
opción 1 ahora: el chequeo de "¿está provisionado?" es el mismo en ambas,
solo cambia qué pasa cuando la respuesta es no — la opción 2 puede
agregarse después sin rehacer la 1.

**Resolución (`007-identidad-autorizacion`, 2026-09-25)**: se implementó la opción 1 tal como se decidió, y se cerró
además un camino que D14 no cubría (FR-004 de `007`, verificado el 2026-09-25): el alta pública por contraseña sobre un
email **ya provisionado** cuyo dueño nunca había ingresado entregaba una sesión de esa cuenta. El hook
`databaseHooks.user.create.before` (`backend/src/auth/identidad-hook.ts`) rechaza con `403 ACCESO_NO_AUTORIZADO`
—mensaje uniforme, sin revelar si el email existe— todo email que no esté en `usuarios`, por los tres métodos y sin
excepción por método; `emailAndPassword.disableSignUp: true` elimina el alta pública por contraseña (verificado por
HTTP y por la API de servidor); y el pedido de enlace para un email no dado de alta responde igual que el de uno dado
de alta pero no crea ni registra ningún enlace. Las altas ahora las hace un admin: `POST /api/usuarios` (email,
provincia, rol inicial) entrega un acceso inicial de un solo uso (vence en `ACCESO_INICIAL_TTL_HORAS`, 24 h) que la
persona canjea en `POST /api/acceso-inicial/canjear` para fijar su contraseña. Cierra también **G5** de `005`. La
opción 2 (solicitud de acceso con aprobación) sigue en el backlog, sin implementar. Evidencia:
`docs/resultado-verificacion-007-20260925.md` (servidor real + 197 tests + spike 19/19).

---

**D15 — Datos reales de personas (email y nombre) comiteados en dos documentos de verificación (2026-09-24): PENDIENTE, requiere reescritura de historial.**

Al revisar la evidencia de `005-frontend-cliente` antes de comitearla se encontró que dos documentos **ya
comiteados y publicados** contienen datos reales de personas que debieron anonimizarse antes de comitear:

| Archivo | Commit | Qué contiene |
|---|---|---|
| `docs/resultado-verificacion-identidad-20260918.md` | `21f8ac1` (US1–US5 de `001`) | un par de emails reales (línea de una tabla de usuarios, ~línea 55) |
| `docs/resultado-verificacion-endpoints-faltantes-20260923.md` | `7057552` (`006`) | nombre y email reales de un usuario, y su id, en los ejemplos de respuesta de `editores` (~líneas 39–42) |

**Alcance.** Ambos commits están en `origin` y en todas estas ramas remotas: el primero en
`001-modelo-datos-relacional`, `002-backend-api-carga-datos`, `003-taxonomia-parametrizable`,
`004-fix-endpoint-taxonomia`, `005-frontend-cliente`, `006-backend-endpoints-faltantes` y `reformulacion`; el
segundo en `005-frontend-cliente`, `006-backend-endpoints-faltantes` y `reformulacion`. Borrar o editar los
archivos en un commit nuevo **no** los saca del historial: seguirían accesibles en los commits anteriores para
cualquiera con acceso al repositorio o a un clon/fork previo.

**Decisión (Santi, 2026-09-24):** no se corrige de pasada. Sacar esos datos requiere **reescribir el historial**
(`git filter-repo` o equivalente) y un `push --force` coordinado sobre todas las ramas afectadas, así que se
hace en una **sesión dedicada**, no dentro de ninguna feature. Este registro solo deja constancia.

**A considerar en esa sesión** (lista de trabajo, no decisiones tomadas):
- confirmar el alcance completo con `git log -S` / `git grep` sobre **todo** el historial y **todas** las ramas
  (incluida `main` y las `feature/*`/`fix/*` remotas), no solo estos dos archivos;
- un aviso a quienes tengan clones: tras la reescritura tienen que volver a clonar o hacer `reset` de sus ramas;
- decidir si en la reescritura se anonimizan los valores (conservando el resto del documento) o se quitan
  los archivos;
- revisar `src/App.jsx` (SPA original): contiene una dirección `@gmail.com` que **no** se evaluó acá (puede ser
  configuración y no un dato personal; se decide en esa sesión);
- verificar al final con `git grep` en todas las ramas que no quede ningún email ni nombre real.

**Ya hecho / regla desde ahora.** La evidencia de `005` (capturas, fixtures de pruebas y `grabar-fixtures.mjs`)
se anonimizó antes de comitear (ver `docs/resultado-verificacion-frontend-20260924.md`). Los documentos de
verificación futuros registran datos **sintéticos o anonimizados** (`usuario-N@ejemplo.test`, "Organismo de
ejemplo N") en lugar de copiar filas reales de la base.

---

**D16 — Errores de integridad sin capturar responden `500` en vez de `400` (hallazgo de `005` para `007`, 2026-09-24): RESUELTA (2026-09-25).**


`006` ya tradujo a un `400` con mensaje los rechazos de `UNIQUE`/`CHECK`/`FK` de **asignaciones de jueces** y de
**editores** (`esRechazoDeIntegridad` / `mensajeDeIntegridad` en `backend/src/http/trigger-error.ts`), pero solo en
esas rutas. Al implementar el frontend se midió contra el backend real que **otras rutas con la misma clase de
error siguen respondiendo `500`**:

- `DELETE /api/pools-jueces/:id` de un pool con asignaciones: `500`, `code: "23503"`, constraint
  `unidad_funcional_grupo_jueces_grupo_jueces_id_fkey` (la FK no tiene `ON DELETE` y la ruta no captura el error).
- `POST /api/organismos/:orgId/unidades-funcionales` con una `localidadId` inexistente: `500`, `code: "23503"`,
  constraint `unidades_funcionales_localidad_id_fkey`.

Es la misma familia que D11 (un rechazo de la base que llega al cliente como `500` genérico). **No verificado**, pero
probable por el mismo motivo: `POST`/`PATCH /api/organismos` con un `denominacionSimplificadaId`, `tipoOficinaId` o
`provinciaId` inexistente, y `POST /api/pools-jueces` con una provincia inexistente.

*Impacto en el frontend (mitigado, no resuelto):* el cliente solo ofrece localidades y pools reales, y traduce el
`500` con `code 23503` del borrado de un pool a "No se pudo eliminar el pool: puede estar asignado a otras
unidades funcionales" (`PoolEnUsoError`, `frontend/src/api/pools.ts`). Ese mensaje es una **inferencia del cliente**
sobre un error genérico: si el backend devolviera un `400` con su propio texto no haría falta.

*Propuesta para `007` (a decidir):* en vez de sumar `try/catch` ruta por ruta, un `setErrorHandler` de Fastify que
mapee los SQLSTATE `23503`/`23505`/`23514`/`23502` a `400` con un mensaje por constraint (ampliando
`MENSAJES_POR_CONSTRAINT`), dejando el `500` para lo verdaderamente inesperado; y decidir la semántica del borrado
de un pool en uso (rechazar con `400` —lo esperado hoy— o `ON DELETE` explícito).

**Resolución (`007-identidad-autorizacion`, 2026-09-25)**: se adoptó la propuesta de un manejador central en lugar de
`try/catch` por ruta. `backend/src/http/errores-integridad.ts` (`setErrorHandler` de Fastify) traduce a `400 { error }`
los errores de Postgres causados por datos del cliente —clase 23 (integridad), clase 22 (valor fuera de rango o mal
formado) y `P0001` (los `RAISE EXCEPTION` de los triggers)— con un mapa por constraint y, para los no mapeados, un
mensaje genérico por tipo, sin nombres de tablas ni de constraints. La ambigüedad de `23503` se resuelve por método HTTP
(`DELETE` ⇒ "en uso", el resto ⇒ "no existe"), no por el texto de `detail`, que Postgres localiza. Lo inesperado sigue
siendo `500`, registrado y sin exponer el mensaje interno. Sobre lo que esta entrada dejaba a decidir: el borrado de un
pool en uso se **rechaza con `400`** (`"El pool está asignado a unidades funcionales; quitalo de esas asignaciones antes
de eliminarlo."`), sin `ON DELETE` (el pool sigue existiendo); y los casos "probables, no verificados" quedaron
verificados con un test por constraint (`denominacionSimplificadaId`, `tipoOficinaId`, `provinciaId` de organismos y
pools, tipo de UF). La revisión adicional de FR-025 encontró dos `500` más, ya cubiertos: un valor fuera de rango
(`smallint`) y un id mal formado. Se quitaron los `try/catch` locales de `006` y `trigger-error.ts`. Con el manejador
desactivado, cuatro de los tests nuevos vuelven a dar `500`: el test detecta el defecto. **Pendiente de la Fase B (no
verificado):** el frontend traduce hoy el `500` con `code 23503` a `PoolEnUsoError` (`frontend/src/api/pools.ts`); con
el `400` nuevo esa inferencia ya no se dispara y conviene mostrar el mensaje del servidor. Evidencia:
`backend/tests/contract/errores-integridad.test.ts` y `docs/resultado-verificacion-007-20260925.md`.

---

**D17 — Todo `bigint` se serializa como string, no solo los ids de usuario (hallazgo de `005` para `007`, 2026-09-24).**

Ampliación de D13. Contra el backend real, **toda columna `bigint`** llega como **string** en el JSON —ids de
organismo, unidad funcional, pool, asignación, localidad y usuario, y sus FK (`propietario_id`, `organismo_id`,
`localidad_id`, `grupoJuecesId`, `usuarioId`)—, incluso en los recursos que usan camelCase (p. ej. asignaciones:
`{"id":"627","grupoJuecesId":"747","cantidadAsignada":3}`); las `smallint`/`integer` llegan como number
(`tipo_oficina_id`, `provincia_id`, `anio_implementacion`, `cantidadAsignada`). Es consecuencia del comportamiento
por defecto de `pg` (el tipo `int8` se devuelve como string). Al mismo tiempo, los **cuerpos** de `POST`/`PATCH`
exigen esos ids como número (`Type.Integer()`), así que un mismo id cambia de tipo según la dirección.

*Resolución vigente (D13):* el backend no se toca; el frontend lo normaliza con un esquema zod por recurso
(`frontend/src/api/ids.ts`, `idWire`) que convierte a `number` y falla con `ContratoInesperado` si el id no es un
entero seguro. Cubierto por una suite de contrato con **19 respuestas reales grabadas**
(`frontend/tests/unit/api/`, `scripts/grabar-fixtures.mjs`).

*Para `007` (opcional, a decidir):* con ~47 usuarios y ids de orden de miles el riesgo de perder precisión es
nulo hoy, así que serializar los `bigint` como número (parser de tipos de `pg` para `int8`) haría la API uniforme;
tiene un límite (`Number.MAX_SAFE_INTEGER`) y es un cambio de contrato para cualquier otro consumidor, por lo que
recién conviene si aparece un segundo cliente (D13, "deuda registrada"). Hasta entonces alcanza con documentar la
regla.

---

**D18 — Los errores de los triggers de taxonomía nombran la pregunta por id interno: FR-009 de `005` solo se cumple en parte (2026-09-24): RESUELTA (2026-09-25).**


`FR-009` (`005`) pide identificar qué pregunta de taxonomía tuvo el problema cuando el backend rechaza un
guardado. Los mensajes de los triggers (`backend/migrations/0001`–`0003`, `RAISE EXCEPTION`) y el `400` del `PUT
/api/organismos/:orgId/taxonomia` mezclan datos internos y **no incluyen el `codigo` de la pregunta**. Ejemplo
real, capturado provocando la deriva de tipo entre la carga del formulario y el guardado:

> `evaluaciones_taxonomicas: la pregunta 1 no aplica al tipo de organismo actual (tipo_oficina_id=3) del organismo 749 (Protección A)`

El `1` es `taxonomia_preguntas.id`, que la API nunca expone (todo va por `codigo`, FR-005 de `004`). Solo el caso
"Pregunta(s) inexistente(s): a, b" trae códigos. Además el mensaje muestra al usuario final nombres de tabla e ids
internos.

*Mitigación en el frontend (parcial):* validación local contra el catálogo del tipo (que evita casi todos estos
rechazos antes de enviar), muestra siempre el mensaje completo del servidor junto al formulario, y resalta la
pregunta **solo** cuando el mensaje contiene su código. No se puede resaltar la pregunta del ejemplo anterior.

*Propuesta para `007`:* que el `400` de `PUT …/taxonomia` devuelva un cuerpo estructurado
(`{ error, preguntaCodigo, opcionCodigo? }`) además del mensaje, y un texto legible para personas; hoy el cliente
solo puede parsear texto libre.

**Resolución (`007-identidad-autorizacion`, 2026-09-25)**: migración `0004_taxonomia_mensajes_legibles` (solo reemplaza
las funciones de los triggers de `0001` y `0003`; no toca tablas ni datos; `down` restaura las originales). Los
rechazos nombran la pregunta por su `codigo` —más el `texto` entre paréntesis si difiere— y no incluyen ids ni nombres de
tabla; por ejemplo, el caso capturado arriba ahora dice `La pregunta «autonomia» no aplica al tipo de organismo
actual.` Cada rechazo que identifica una pregunta agrega `DETAIL = 'preguntaCodigo=<codigo>'`, y el `PUT
/api/organismos/:orgId/taxonomia` lo lee de `err.detail` (independiente del idioma del servidor) y responde
`400 { error, preguntaCodigo, preguntaTexto }`. Además valida antes de tocar la base que cada opción exista para la
pregunta (`La opción «X» no existe para la pregunta «Y».`). **Desvío respecto de la propuesta:** el cuerpo no incluye
`opcionCodigo`; la opción va en el texto del mensaje. Si hay varias respuestas inválidas se informa al menos la
primera y no se guarda nada. Sigue abierto **D19**: mientras no se carguen los enunciados reales, `preguntaTexto`
coincide con el código. El resaltado de la pregunta en el formulario es trabajo de la Fase B. Evidencia:
`backend/tests/contract/taxonomia.test.ts` (sección 007), `backend/tests/integration/migracion-0004.test.ts` y
`docs/resultado-verificacion-007-20260925.md`.

---

**D19 — `taxonomia_preguntas.texto` es idéntico a `codigo` en las 9 preguntas migradas: no hay enunciado legible cargado (2026-09-24).**

Verificado por SQL contra la base: en las 9 filas de `taxonomia_preguntas`, `texto = codigo`
(`insercion_institucional`, `jerarquia_normativa`, `dependencia`, `asistencia_jurisdiccional`, `autonomia`,
`alcance_proceso`, `alcance_fuero`, `presencia_territorial`, `grado_implementacion`); el campo `grupo` es también un
identificador sin tildes (`institucional`, `organizacion`, `gestion`, `implementacion`). Las **opciones**
(`taxonomia_opciones.etiqueta`) sí tienen texto real, en español y con tildes. Es un dato **sin cargar**, no un error
de código: la migración `0001` sembró el código en ambos campos.

*Impacto:* `FR-008` de `005` ("mostrar el texto real de cada pregunta, no su código interno") **no puede cumplirse
con estos datos**. Contingencia del frontend (`etiquetaPregunta`, `etiquetaGrupo` en
`frontend/src/features/taxonomia/mezclar.ts`): si `texto` es igual a `codigo` se muestra el código sin guiones
bajos y con mayúscula inicial ("Insercion institucional", "Organizacion"), **sin tildes** —no se pueden inventar—.
Cuando se carguen los enunciados reales el cliente los usa solo (la condición deja de cumplirse).

*Pendiente (dato, no código):* cargar el enunciado real de cada pregunta y un rótulo legible por grupo, con una
migración de datos nueva (las migraciones aplicadas no se editan — `backend/README.md`). La fuente de los
enunciados no está confirmada en este repositorio; a definir por quien conoce el instrumento. Relacionado: las 9
preguntas son todas de `opcion_unica`, así que los otros tres tipos de respuesta (múltiple, numérica, texto libre)
no tienen ninguna pregunta real todavía y solo se probaron con un catálogo sintético.

---

**D20 — Un usuario puede autoasignarse cualquier provincia y con eso ganar acceso a los pools de esa provincia (hallazgo de `005` para `007`, 2026-09-24). PRIORIDAD ALTA: es un problema de autorización, no de UX: RESUELTA (2026-09-25).**


**Qué pasaba antes de `007`** (verificado en el código de `002`, `reformulacion`):
- `PATCH /api/usuarios/:id` (`backend/src/routes/usuarios.ts`) acepta `provinciaId` y lo autoriza con
  `puedeEditarUsuario` (`authz/usuarios.ts`): **el propio usuario o un admin**. No hay ningún control sobre el
  valor de `provinciaId`.
- Ese campo **decide el acceso a los pools de jueces**: `resolverIdentidad` relee `provincia_id` de `usuarios` en
  cada request, y `estaAutorizadoParaProvincia`/`puedeGestionarPool` (`authz/pools-jueces.ts`, vía
  `mismaProvincia()`) autorizan según esa provincia. Con ella `GET /api/pools-jueces` lista los pools de esa
  provincia y `POST/PATCH/DELETE` permiten crearlos, modificarlos y borrarlos.
- Consecuencia: **cualquier usuario autenticado puede cambiarse a cualquier provincia y ganar, sin intervención
  de un admin, lectura y escritura sobre los pools de esa provincia**, y volver a cambiarse a otra. (La
  autorización de organismos/UF/taxonomía/editores va por propietario/editor/admin y **no** depende de este campo.)

**Cómo se relaciona con la app vieja (matiz importante).**
- En la **interfaz** vieja, la provincia la asignaba un admin: `CrearOrganismoForm.jsx` muestra "No podés crear
  organismos todavía: no tenés una provincia asignada. Un administrador tiene que asignarte una provincia…". La app
  nueva (`005`) permite lo contrario: el perfil deja elegir la provincia (verificado en el recorrido de SC-002).
- En la **capa de autorización** vieja no había diferencia: las reglas de Firestore
  (`docs/firestore-rules-actuales.rules`, `match /users/{userId}`) permitían `write: if request.auth.token.email
  == userId || esAdmin()`, es decir, cada usuario podía escribir su propio documento —incluida `provincia`, y
  también `rol`—. `002` portó esa regla (Principio VI) y **cerró la parte de `rol`** (el `PATCH` no acepta rol),
  pero dejó abierta la de `provincia`. Es decir: no es una regresión respecto de las reglas viejas, sino una
  debilidad heredada que la UI vieja ocultaba y la app nueva expone.

**Decisión (Santi, 2026-09-24):** se resuelve en `007`, **restringiendo la escritura de `provinciaId` a admin
únicamente**, con el mismo criterio que `propietario_id` en organismos (el servidor no confía en lo que manda el
cliente). No bloquea `005` ni `006` porque todavía no hay usuarios reales expuestos, pero es **de mayor prioridad
que las otras deudas de `007`** por su naturaleza de autorización.

**A definir en `007` (detalles de la corrección, no de la decisión):**
- qué hace el servidor con `provinciaId` de un no admin: **rechazar con `403`** (visible) o **ignorarlo en
  silencio** (como `propietario_id`). Se sugiere `403`: ignorarlo dejaría a la UI mostrando "cambios guardados" sin
  que cambie nada;
- cómo asigna la provincia un admin: hoy la pantalla de usuarios de `005` es de solo lectura (US9, decisión 1);
  hace falta que el admin pueda editar la provincia de un usuario (backend ya lo permite; falta la UI);
- cuál es el estado de un usuario recién creado (por Google o enlace, D14): sin provincia hasta que un admin la
  asigne; quién avisa al admin (relacionado con D14 y el ítem 9 del backlog);
- revisar si `foto_url` y `nombre_display` merecen algún control (hoy editables por el propio usuario, sin
  impacto de autorización).

**Cambios de frontend que implica** (a hacer junto con `007`): el selector de provincia de `/perfil` pasa a solo
lectura para `usuario_normal`; el mensaje del alta sin provincia deja de decir "completá tu provincia en tu
perfil" y pasa a "pedile a un administrador que te asigne una provincia"; y el recorrido de SC-002
(`recorrido-sc002.spec.ts`) cambia, porque un usuario nuevo ya no podrá completar el alta por sí solo.

**Mientras tanto**, el frontend ya trata la provincia como UX, no como control de acceso (Principio II), y así
está dicho en `docs/resultado-verificacion-frontend-20260924.md`; pero eso no protege los pools: la barrera real
es la del backend.

**Resolución (`007-identidad-autorizacion`, 2026-09-25)**: `provinciaId` la escribe solo un admin. Sobre los puntos que
esta entrada dejaba "a definir": (a) un no admin que intenta **cambiarla** recibe `403` explícito
(`"La provincia de un usuario solo la puede asignar un administrador."`) y la solicitud se rechaza **completa**, sin
aplicar ni siquiera el nombre —se descartó ignorarla en silencio—; (b) reenviar la provincia **actual** no cuenta como
cambio (FR-010): el perfil de `005` sigue funcionando hasta la Fase B, y un cambio real de provincia desde ese
formulario dará `403`; (c) un admin la asigna con `PATCH /api/usuarios/:id` (provincia inexistente → `400` con
mensaje) y rige desde la siguiente solicitud del afectado, sin re-login; (d) el alta administrada exige provincia para
un usuario normal y la deja opcional para un admin. El selector de provincia de `/perfil` y el resto de los cambios de
frontend de esta entrada siguen pendientes de la Fase B (fuera del alcance de `007`).

**G1 y G3 (brechas de `005`, `specs/005-frontend-cliente/research.md`), cerradas en la misma feature:**
- **G1 — sin endpoint para cambiar el rol de un usuario: RESUELTA (2026-09-25).** `PUT /api/usuarios/:id/rol
  { rol: "admin" | "usuario_normal" }`, solo admin (`403` si no), agrega o quita la fila `admin` y conserva siempre
  `usuario_normal`; rige en la siguiente solicitud sin re-login; el sistema nunca queda sin administradores
  (`400` al quitarle el rol al último, verificado también en la carrera de dos degradaciones simultáneas); usuario o
  rol inexistente → `404`/`400`, nunca `500`.
- **G3 — sin forma de fijar o cambiar la contraseña desde el cliente: RESUELTA (2026-09-25).** *Fijar*: el acceso
  inicial de D14 (`POST /api/acceso-inicial/canjear`, un solo uso y con vencimiento; `POST
  /api/usuarios/:id/acceso-inicial` lo reemite e invalida el anterior); la contraseña sobrevive a un ingreso posterior
  por Google o enlace. *Cambiar*: `POST /api/auth/change-password` (ya existía) ahora **fuerza en el servidor** que
  las demás sesiones se cierren y que la cookie de la sesión actual rote. El restablecimiento por correo
  (`request-password-reset`) sigue deshabilitado a propósito hasta el envío real de email (Fase C).
- Los controles de UI correspondientes (rol y provincia editables, pantalla de primer acceso) son de la Fase B.
