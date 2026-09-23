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

**D11 — Endpoint de taxonomía roto por la migración de esquema de 003: RESUELTA (2026-09-23).**

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

*No bloqueaba el cierre de `003`* (fuera de su alcance declarado: modelo de
datos, no API) — bloqueaba cualquier uso real de la app antes del corte a
producción.

**Resolución (`004-fix-taxonomia-endpoint`)**: `GET`/`PUT
/api/organismos/:orgId/taxonomia` reconstruidos contra el esquema real de
`003` — `GET` agrupa por pregunta con texto/tipo incluidos; `PUT`
reemplaza el conjunto completo atómicamente y traduce cualquier rechazo de
trigger a un `400` identificable (nunca `500`). Cobertura de test agregada
(`backend/tests/contract/taxonomia.test.ts`, 11 casos) — la ausencia que
causó esta regresión ya no existe. De paso, la misma feature agregó dos
protecciones de integridad relacionadas con el caso histórico de OGA
Mediación (organismo id=311, hipótesis sin confirmar de
`003-taxonomia-parametrizable`): un trigger nuevo (migración `0003`) que
impide que una respuesta *nueva* se guarde para una pregunta que no aplica
al tipo del organismo, y una verificación de aviso/confirmación en `PATCH
/api/organismos/:id` antes de perder taxonomía por un cambio de tipo. El
organismo id=311 en sí **no** fue tocado ni corregido retroactivamente —
sigue con sus 9 respuestas históricas intactas, confirmado explícitamente
en cada paso de la implementación.

---

**D12 — `evaluaciones_taxonomicas_v1_legacy` queda como respaldo auditable, sin fecha de borrado (003-taxonomia-parametrizable, 2026-09-22).**

La migración `0001_taxonomia_parametrizable` renombra la tabla vieja de 9
columnas (`evaluaciones_taxonomicas`) a `evaluaciones_taxonomicas_v1_legacy`
en vez de borrarla — queda en `public.*` con sus 89 filas intactas,
sin uso por ningún código de aplicación. Es una decisión deliberada
(`research.md` de `003-taxonomia-parametrizable`, Decisión 4), no un olvido:
la reconciliación automática de la migración valida *cantidad*
(origen=destino=801), no necesariamente cada valor individual sin una
auditoría manual adicional — conservar la tabla vieja un ciclo más permite
esa auditoría sin depender de un backup externo, a un costo casi nulo (89
filas).

*Decisión pendiente, explícitamente fuera de esta feature:* cuándo (o si)
borrar `evaluaciones_taxonomicas_v1_legacy`. No es una decisión de `003` —
esa feature solo la crea y la deja disponible. Corresponde a una migración
posterior, después de que exista suficiente confianza (auditoría manual,
uso real en producción sin discrepancias reportadas) de que la migración a
la tabla de respuestas parametrizable fue completa y correcta.
