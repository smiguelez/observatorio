# Borrador de Constitution — Reformulación del Observatorio de Oficinas Judiciales

> **Estado:** borrador para revisión de Santi. No pegar en `/speckit-constitution`
> hasta confirmar los principios III–V (nuevos, sobre autenticación).
>
> **Derivado de:** `docs/auditoria-app-actual.md`,
> `docs/verificacion-datos-firestore.md` (auditoría del 2026-09) y la decisión
> de autenticación multi-método tomada el 2026-09.
>
> **Formato:** cada principio usa MUST / SHOULD como términos normativos.
> `/speckit-converge` los evalúa literalmente: una violación de un MUST es un
> hallazgo CRITICAL. Redactar con esa consecuencia en mente — un MUST que no
> pensás sostener es peor que un SHOULD honesto.
>
> **Decisiones pendientes:** ver `docs/decisiones-pendientes.md`, aparte de
> este archivo — la constitution no es el lugar para dejar cosas sin cerrar.

---

## I. Soberanía de datos sobre conveniencia técnica (MUST)

El sistema **MUST** poder operar sin dependencia funcional de Google Cloud
Platform para almacenamiento de datos, autorización y reporting. Ninguna
decisión de arquitectura puede reintroducir una dependencia de GCP en la ruta
crítica, ni siquiera como paso intermedio "temporal".

La autenticación queda fuera de esta restricción de forma explícita y
deliberada: el sistema soportará varios métodos, entre ellos Google Sign-In
(ver Principio III), sin que ninguno sea un prerequisito obligatorio de
funcionamiento.

*Fundamento:* es el motivo original del proyecto. Sin este principio escrito,
cada decisión difícil tiende a resolverse volviendo a un servicio gestionado de
GCP porque es el camino de menor resistencia.

---

## II. La autorización vive en el servidor (MUST)

Toda decisión de autorización — quién puede leer, crear, editar o borrar qué —
**MUST** ser tomada y aplicada por el backend. El frontend **MUST NOT** ser la
única barrera para ninguna operación: ocultar un botón o no montar una ruta es
mejora de experiencia de usuario, nunca control de acceso.

Ningún cliente **MUST** tener credenciales que le permitan hablar directamente
con la base de datos.

*Fundamento:* la auditoría (§0, §5.3) estableció que hoy no existe backend: el
navegador habla directo con Firestore y el único enforcement real son las
Security Rules. `App.jsx:168-170` no monta las rutas admin, pero eso es
cosmético. Al eliminar Firestore desaparece esa capa de enforcement; si el
reemplazo no está escrito como principio, el riesgo concreto es una app sin
autorización real.

---

## III. Autenticación plural, ningún método es prerequisito obligatorio (MUST)

El sistema **MUST** ofrecer al menos tres métodos de autenticación desde el
lanzamiento: credenciales locales (usuario y contraseña), Google Sign-In, y
magic link (enlace de acceso de un solo uso enviado por email). El diseño
**MUST** permitir sumar métodos adicionales sin reescribir el modelo de
identidad de base — este listado queda deliberadamente abierto a evaluación
futura, no es exhaustivo.

El sistema **MUST** poder operar con autenticación local únicamente, sin que
la disponibilidad de Google (o de cualquier proveedor externo agregado
después) sea condición para que un usuario pueda iniciar sesión.

*Fundamento:* decisión tomada el 2026-09, en reemplazo de la intención original
de `SPEC.md` §2 de conservar Firebase Auth sin alternativa. Resuelve la
dependencia de identidad que el Principio I dejaba pendiente.

---

## IV. Credenciales y tokens de autenticación, seguros por diseño (MUST / SHOULD)

Toda contraseña **MUST** almacenarse mediante un algoritmo de hashing
diseñado para credenciales, con salt único por usuario (bcrypt, argon2id o
scrypt). El sistema **MUST NOT** almacenar contraseñas en texto plano ni
usar un hash genérico sin salt (MD5, SHA-256 simple), y **MUST NOT** exponer
una contraseña en texto plano en logs, mensajes de error, o respuestas de
API bajo ninguna circunstancia.

Todo token de magic link **MUST** ser de un solo uso y **MUST** expirar en un
plazo corto (orden de minutos, a definir en el plan); **MUST** invalidarse
inmediatamente después de su primer uso o al expirar, lo que ocurra primero.

El sistema **SHOULD** limitar los intentos de login fallidos por cuenta y por
origen (rate limiting o bloqueo progresivo) desde la primera versión, para
mitigar ataques de fuerza bruta y *credential stuffing* — queda como SHOULD
para v1, con intención explícita de endurecerlo a MUST en una revisión
posterior de esta constitution.

*Fundamento:* al sumar autenticación local y magic link, el proyecto asume una
responsabilidad de seguridad que hoy resuelve Firebase por vos. Es la
contrapartida directa de ganar independencia de Google en este punto: ese
trabajo lo tiene que hacer bien el backend propio desde el primer commit. El
rate limiting queda en SHOULD para no bloquear el lanzamiento por esto, pero
la intención de endurecerlo queda registrada para no perderse.

---

## V. Identidad unificada entre métodos de autenticación (MUST)

Un mismo usuario **MUST** resolver a un único registro de identidad,
independientemente del método por el cual inició sesión. Vincular un nuevo
método de autenticación a una cuenta existente **MUST** requerir verificación
de la propiedad del email (u otro identificador equivalente) antes de
habilitar el acceso combinado.

El sistema **MUST NOT** fusionar automáticamente dos identidades solo porque
comparten el mismo valor de email sin verificar — esa coincidencia textual, sin
prueba de propiedad, es la vía típica de apropiación de cuenta cuando coexisten
varios proveedores de login.

*Fundamento:* hoy `users` usa el email como clave y como base del ownership de
organismos (auditoría §2.1, §2.2). Sumar un segundo método de autenticación sin
esta regla multiplica las formas de reclamar "soy este email" y, con eso, el
riesgo de que alguien acceda a organismos que no le pertenecen.

---

## VI. El modelo de autorización se reconstruye desde la fuente, no desde la memoria (MUST)

Antes de implementar cualquier control de acceso, el proyecto **MUST** contar
con las Firestore Security Rules vigentes obtenidas de la consola y
versionadas en el repositorio. La transcripción del `SPEC.md` (fechada
2026-07-27) **MUST NOT** usarse como fuente de verdad.

Cada regla del modelo actual **MUST** tener una decisión explícita registrada:
se reimplementa igual, se reimplementa distinto (con la razón), o se descarta
(con la razón).

*Fundamento:* auditoría §5.3 y §8.3. Es la única lógica de negocio del sistema
que vive exclusivamente fuera del repositorio. Si se pierde, no hay forma de
detectar la omisión por testing: un permiso que falta no rompe nada visible,
solo deja gente afuera o adentro de donde no corresponde.

---

## VII. El esquema relacional se diseña sobre datos verificados, no sobre supuestos del código (MUST)

Ninguna decisión de modelado de datos **MUST** tomarse basándose únicamente en
lo que el código actual asume. Las verificaciones de
`docs/verificacion-datos-firestore.md` **MUST** ejecutarse y sus resultados
registrarse — con fecha de corrida — antes de definir tipos de columna,
restricciones de nulidad o claves foráneas.

Cuando los datos reales contradigan lo que el código asume, gana el dato real:
la decisión es cómo tratarlo (limpiar, mapear, o aceptar la variabilidad), no
ignorarlo.

*Fundamento:* la auditoría documenta divergencias ya evidentes en el propio
código defensivo — `actualizado_a` manejado como Timestamp *o* string
(`OrganismoForm.jsx:23-33`), `jueces_asistidos` y `anio_implementacion`
guardados como texto libre pero evaluados como números
(`GestionOrganismosForm.jsx:38`), taxonomía con valores posiblemente no-string
(existe un script dedicado a detectarlo). Ninguna de esas divergencias
sobrevive a un `NOT NULL` o un `integer` sin una decisión previa.

---

## VIII. Integridad referencial explícita (MUST)

El modelo relacional **MUST** declarar como claves foráneas las relaciones que
hoy son referencias sueltas: `unidades_funcionales.localidad_id` →
`localidades`, `unidades_funcionales.pool_jueces_id` → `pools_jueces`,
`organismos.usuario_google` → usuarios, y `organismos.editores[]` normalizado
a tabla puente.

Las referencias rotas detectadas por las verificaciones **MUST** resolverse
antes de la carga — no se aplaza aceptando datos huérfanos "por ahora".

*Fundamento:* auditoría §2.2, §2.3 y verificación V7.5. Hoy una referencia
rota degrada silenciosamente en la UI (muestra el id crudo, o `'(pool)'` sin
cantidad). En Postgres con FK, esa misma fila no entra — el problema deja de
ser silencioso, que es exactamente el objetivo, pero exige limpiarlo antes.

---

## IX. Migración por partes, con la app actual operativa (MUST)

La aplicación en producción **MUST** permanecer operativa durante todo el
proyecto. La reformulación **MUST** descomponerse en specs independientes que
se verifican por separado; **MUST NOT** haber un único corte donde base de
datos, backend y frontend nuevos se estrenen simultáneamente.

Hasta el cierre formal del proyecto, la fuente de datos original **MUST**
mantenerse disponible en modo de solo lectura como respaldo verificable.

*Fundamento:* el sistema lo usan referentes de 24 jurisdicciones cargando datos
propios. Un corte total que falle no es un rollback técnico: es pérdida de
confianza institucional en el instrumento, que cuesta mucho más recuperar que
el tiempo de desarrollo.

---

## X. Cero pérdida de datos, verificada por reconciliación (MUST)

Toda migración de datos **MUST** producir un log de reconciliación con conteo
en origen y conteo en destino por entidad. "Corrió sin error" **MUST NOT**
aceptarse como evidencia de completitud.

Si un conteo no coincide, el corte de esa entidad **MUST** detenerse hasta
resolver la discrepancia.

*Fundamento:* los datos son un relevamiento federal construido a lo largo de
años por referentes de cada provincia. No hay forma de regenerarlos si se
pierden.

---

## XI. El código muerto no se migra (SHOULD)

La reformulación **SHOULD** tratar la app actual como fuente de requisitos
funcionales, no como base de código a portar. Lo identificado como huérfano,
duplicado o inconsistente en la auditoría §7.2 y §7.3 **SHOULD NOT** aparecer
en el sistema nuevo salvo decisión explícita que lo justifique.

*Fundamento:* auditoría §7.2. Hay funcionalidad huérfana con lógica divergente
del catálogo canónico (`importarTaxonomiaDesdeCSV.js` mapea códigos que la UI
no reconoce), componentes sin uso, y un `Button` que descarta `variant`/`size`
haciendo que todos los botones se vean iguales. Portar eso es heredar deuda que
ya está identificada.

---

## XII. Trazabilidad de decisiones (SHOULD)

Cada decisión de diseño que se aparta del comportamiento actual **SHOULD**
registrarse con: qué hacía el sistema anterior, qué hace el nuevo, y por qué.
Cuando una afirmación provenga de una fuente externa al repositorio (consola de
GCP, Looker Studio, Vercel), **SHOULD** indicarse la fuente y la fecha de
consulta.

*Fundamento:* el proyecto tiene tres puntos ciegos activos documentados en la
auditoría §8 (pipeline a BigQuery, vistas y dashboards, configuración de
Vercel). Sin trazabilidad, en tres meses no habrá forma de distinguir una
decisión deliberada de un olvido.

---

## XIII. Secretos fuera del árbol del proyecto (MUST)

Ninguna credencial **MUST** residir dentro del directorio del repositorio, aun
cuando esté cubierta por `.gitignore`. Las credenciales **MUST** cargarse desde
variables de entorno o un gestor de secretos, y las rutas a archivos de
credenciales **MUST NOT** estar hardcodeadas en el código.

*Fundamento:* auditoría §5.5 — hoy el service account key vive en `scripts/` y
`importar_denominaciones.cjs:5` hardcodea su ruta absoluta. `.gitignore` protege
contra un commit accidental, no contra un backup, un `tar`, o un disco.

---

## Gobernanza

Esta constitution gobierna todas las specs, planes y tareas del proyecto de
reformulación. En caso de conflicto entre una spec y esta constitution, gana la
constitution; la spec se corrige.

Una enmienda requiere: la versión nueva del principio, la razón del cambio, y
la fecha. Los principios no se eliminan en silencio.

**Historial de enmiendas:**
- 2026-09 (v0.2): Principio I acotado para excluir explícitamente autenticación.
  Agregados los Principios III, IV y V (autenticación plural, contraseñas
  seguras, identidad unificada), a partir de la decisión de soportar múltiples
  métodos de login. Sección "Decisiones abiertas" removida de este archivo —
  ver `docs/decisiones-pendientes.md`.
- 2026-09 (v0.3): Principio III confirma magic link como tercer método de
  autenticación desde el lanzamiento. Principio IV renombrado para cubrir
  también seguridad de tokens de magic link (de un solo uso, expiración
  corta); el requisito de rate limiting/bloqueo por intentos fallidos se baja
  de MUST a SHOULD para la v1, con intención registrada de endurecerlo después.

**Versión:** 0.3 (borrador, confirmado por Santi) — **Fecha:** 2026-09
