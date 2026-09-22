# Feature Specification: Backend/API — autorización y carga de datos

**Feature Branch**: `002-backend-api-carga-datos`

**Created**: 2026-09-18

**Status**: Draft

**Input**: User description: "Especificá el backend/API del observatorio — una herramienta de carga de datos para referentes del foro (no una app de transparencia pública; la comunicación pública de resultados es atribución del foro, vía reportes, y no forma parte de esta app). Reemplaza el acceso directo del navegador a la base de datos (Principio II) y reconstruye el modelo de autorización desde las Firestore Security Rules reales (docs/firestore-rules-actuales.rules, Principio VI — no uses SPEC.md). [reglas detalladas de organismos/UF/taxonomía/pools_jueces/users/localidades, identidad por id subrogado con tres métodos de autenticación, hashing y magic link, y alcance excluyendo frontend/exposición pública/reporting/stack técnico — ver conversación completa]"

## Contexto y alcance

Esta es una herramienta interna de **carga y gestión de datos** para
referentes del foro (propietarios/editores de organismos, referentes
provinciales de jueces, administradores). **No es** una aplicación de
transparencia pública: la comunicación de resultados hacia afuera es
atribución del foro, vía reportes, y no forma parte de esta API. No existe
hoy ningún endpoint de lectura anónima o pública, y esta spec no agrega
ninguno.

Esta API **reemplaza el acceso directo del navegador a la base de datos**
(Principio II): hoy el frontend habla directo con Firestore y el único
control de acceso son las Security Rules; con el modelo relacional
(`001-modelo-datos-relacional`) esa vía desaparece, y **todo** el control de
acceso que hoy vive en `docs/firestore-rules-actuales.rules` debe
reconstruirse en este backend, evaluado en cada request contra el estado
actual de los datos — nunca solo en el cliente (Principio II/VI).

**Fuera de alcance explícito de esta spec**:
- El frontend (consume esta API; no se especifica acá).
- Cualquier mecanismo de exposición pública o anónima de datos (no existe
  hoy en las reglas actuales; no se agrega acá).
- El pipeline de reporting hacia el público (BigQuery/Looker Studio) — es
  una feature aparte, ya existente, que no consume esta API.
- El stack técnico concreto (framework, lenguaje, ORM) — corresponde a
  `/speckit-plan`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Identidad única sin importar el método de login (Priority: P1)

Un referente inicia sesión alguna vez con Google Sign-In y otra vez con
usuario/contraseña (o completa el flujo de magic link), y en todos los casos
el sistema lo reconoce como la misma persona, con el mismo id subrogado y el
mismo conjunto de organismos/permisos — nunca como dos cuentas separadas.

**Why this priority**: es el prerequisito de todo lo demás. Sin identidad
unificada y sin una sesión emitida por el backend (no un claim de Firebase),
ninguna de las reglas de autorización de abajo tiene un sujeto estable
contra el cual evaluarse.

**Independent Test**: crear una identidad por un método, vincular un segundo
método al mismo email verificado, e iniciar sesión por el segundo método —
debe resolver al mismo `usuarios.id` y a los mismos permisos, sin necesidad
de que exista todavía ningún organismo cargado.

**Acceptance Scenarios**:

1. **Given** un usuario sin cuenta previa, **When** se registra con
   credenciales locales (usuario/contraseña), **Then** el sistema crea un
   único registro de identidad y emite una sesión propia del backend (no un
   token de Firebase).
2. **Given** un usuario con cuenta ya creada por credenciales locales,
   **When** inicia sesión con Google Sign-In usando el mismo email
   verificado, **Then** el sistema lo resuelve al mismo `usuarios.id`, sin
   crear una segunda identidad.
3. **Given** un usuario que solicita un magic link, **When** hace clic en el
   enlace dentro del plazo de expiración y antes de que nadie más lo haya
   usado, **Then** el sistema le emite una sesión válida para su identidad
   existente o crea una nueva si es la primera vez que ese email inicia
   sesión.
4. **Given** un magic link ya usado una vez, **When** alguien intenta
   usarlo de nuevo, **Then** el sistema lo rechaza.
5. **Given** dos usuarios con el mismo valor de email pero sin verificación
   de propiedad cruzada entre métodos, **When** el sistema evalúa si son la
   misma identidad, **Then** **no** los fusiona automáticamente solo por
   coincidencia textual de email.

---

### User Story 2 - Un referente gestiona sus propios organismos (Priority: P1)

Un referente crea un organismo asignándose como responsable, y luego puede
leer, editar o borrar únicamente los organismos de los que es propietario o
editor (y sus unidades funcionales y evaluación taxonómica) — nunca los de
otro organismo del que no forma parte.

**Why this priority**: es el caso de uso central de la herramienta ("carga
de datos para referentes del foro"); es además donde vive hoy la única
lógica de negocio real de las Security Rules (ownership + lista de
editores).

**Independent Test**: con dos organismos ya cargados (A y B) y dos usuarios
(propietario de A, sin relación con B), verificar que el usuario puede
leer/editar/borrar A y **no puede** ni leer B.

**Acceptance Scenarios**:

1. **Given** un usuario autenticado sin ningún organismo propio, **When**
   crea un organismo nuevo, **Then** el sistema lo registra como propietario
   de ese organismo, sin exigirle ningún rol especial.
2. **Given** un organismo con propietario P y lista de editores [E1, E2],
   **When** P, E1, E2 o un admin intentan leer, editar o borrar ese
   organismo, **Then** la operación se permite.
3. **Given** el mismo organismo, **When** un usuario que no es P, no está en
   [E1, E2] y no es admin intenta leer, editar o borrar ese organismo,
   **Then** la operación se rechaza.
4. **Given** una unidad funcional o una evaluación taxonómica de un
   organismo, **When** se evalúa si un usuario puede leerla o escribirla,
   **Then** el resultado es exactamente el mismo que si se evaluara sobre el
   organismo padre (propietario/editor/admin) — no hay una regla propia
   distinta para la subcolección.
5. **Given** un editor E1 que es removido de la lista de editores de un
   organismo, **When** E1 hace la siguiente solicitud sobre ese organismo,
   **Then** el sistema le niega el acceso inmediatamente, sin requerir que
   E1 cierre sesión.

---

### User Story 3 - Un referente provincial gestiona los grupos de jueces de su provincia (Priority: P2)

Un usuario autenticado de una provincia puede leer, crear, editar o borrar
los grupos de jueces (pools) de esa misma provincia, sin necesidad de ser
propietario ni editor individual de nada — el control es por provincia, no
por persona.

**Why this priority**: es la segunda pieza de autorización real del sistema
actual, con una forma distinta (scoping geográfico) a la de organismos
(ownership individual); necesaria para que la carga de datos de jueces no
dependa de ownership.

**Independent Test**: con un pool de la provincia X y dos usuarios (uno de
provincia X, otro de provincia Y, ninguno admin), verificar que el de X
puede operar sobre el pool y el de Y no.

**Acceptance Scenarios**:

1. **Given** un pool de jueces de la provincia X, **When** un usuario
   autenticado cuya provincia es X intenta leer, crear, editar o borrar ese
   pool (o crear uno nuevo asignado a la provincia X), **Then** la operación
   se permite.
2. **Given** el mismo pool, **When** un usuario autenticado de una
   provincia distinta a X, sin rol admin, intenta cualquiera de esas
   operaciones, **Then** se rechaza.
3. **Given** el mismo pool, **When** un admin intenta cualquiera de esas
   operaciones sin importar su propia provincia, **Then** se permite.
4. **Given** un usuario cuya provincia cambia (p. ej. corrección de perfil),
   **When** hace la siguiente solicitud, **Then** su acceso a pools se
   evalúa contra su provincia actual, no la que tenía al iniciar sesión.

---

### User Story 4 - Consulta y edición de perfiles de usuario (Priority: P2)

Cualquier usuario autenticado puede consultar el perfil de otro usuario
(hoy: email, rol y provincia — visibilidad amplia, sin acotar a admin o al
propio usuario), pero solo puede **editar** su propio perfil, salvo un
admin, que puede editar cualquiera.

**Why this priority**: necesario para que los flujos de asignar
propietario/editores por email sigan funcionando (hoy dependen de poder
consultar perfiles de otros usuarios); la visibilidad amplia se confirmó
igual que la regla real (ver FR-017).

**Independent Test**: con dos usuarios sin relación entre sí, verificar que
uno puede leer el perfil del otro pero no editarlo.

**Acceptance Scenarios**:

1. **Given** un usuario autenticado, **When** consulta el perfil de
   cualquier otro usuario, **Then** el sistema permite la lectura completa
   (email, rol, provincia) — visibilidad amplia confirmada, igual que la
   regla real.
2. **Given** un usuario autenticado, **When** intenta editar su propio
   perfil, **Then** la operación se permite.
3. **Given** dos usuarios sin relación entre sí, **When** el usuario A
   intenta editar el perfil del usuario B, **Then** se rechaza, salvo que A
   sea admin.

---

### User Story 5 - Consulta de catálogo de localidades (Priority: P3)

Cualquier usuario autenticado puede consultar el catálogo de localidades
para completar formularios de organismos/UF, pero no puede darlas de alta,
editarlas ni borrarlas a través de esta API — se cargan por un proceso
separado.

**Why this priority**: es la pieza de menor riesgo y menor complejidad
(catálogo de solo lectura), independiente de todo lo demás.

**Independent Test**: verificar que un usuario autenticado puede leer
localidades, y que ningún intento de alta/edición/borrado de una localidad a
través de esta API tiene éxito, sin importar el rol del usuario.

**Acceptance Scenarios**:

1. **Given** un usuario autenticado, **When** consulta el catálogo de
   localidades, **Then** la lectura se permite.
2. **Given** cualquier usuario (incluido un admin), **When** intenta crear,
   editar o borrar una localidad a través de esta API, **Then** la
   operación no está disponible — ese mantenimiento ocurre fuera de esta
   API, por un proceso separado.

---

### Edge Cases

- Un usuario sin sesión (no autenticado) intenta cualquier operación sobre
  cualquiera de las entidades cubiertas (organismos, UF, taxonomía,
  pools_jueces, usuarios, localidades) → se rechaza siempre; no existe
  ninguna lectura pública/anónima.
- Un token de sesión (de cualquiera de los tres métodos de login) queda
  vigente después de que cambiaron los datos de autorización del usuario
  (se lo removió de una lista de editores, cambió de provincia, perdió el
  rol admin) → la siguiente solicitud se evalúa contra el estado **actual**
  de esos datos, no contra un valor cacheado al momento del login.
- Alguien intenta vincular un segundo método de autenticación (p. ej. Google)
  a una cuenta local existente sin haber verificado la propiedad de ese
  email por ese segundo método → se rechaza el vínculo hasta verificar.
- Un magic link expira antes de ser usado → se rechaza al intentarlo.
- Un magic link ya usado se reintenta (replay) → se rechaza.
- Intentos de login fallidos repetidos sobre la misma cuenta o el mismo
  origen → el sistema debería limitarlos (Principio IV, SHOULD).
- Un organismo referencia un `propietario_id` que no resuelve a ningún
  usuario existente (no debería ocurrir dado el modelo con FK de
  `001-modelo-datos-relacional`, pero si ocurriera) → ninguna operación de
  autorización debe fallar de forma no controlada; solo un admin puede
  operar sobre ese organismo hasta que tenga un propietario válido.
- Un usuario autenticado que es propietario de un organismo intenta crear
  una unidad funcional o evaluación taxonómica bajo un organismo **ajeno**
  → se rechaza, igual que si intentara editar el organismo ajeno
  directamente (misma regla, sin excepción por tipo de recurso).

## Requirements *(mandatory)*

### Functional Requirements

**Acceso al dato (Principio II)**

- **FR-001**: El sistema MUST exponer toda lectura y escritura sobre
  organismos, unidades funcionales, evaluaciones taxonómicas, grupos de
  jueces (pools), usuarios y localidades exclusivamente a través de esta
  API. Ningún cliente MUST tener credenciales que le permitan conectarse
  directamente a la base de datos.
- **FR-002**: El sistema MUST evaluar toda decisión de autorización en el
  servidor, en cada solicitud, contra el estado actual de los datos
  (propiedad, lista de editores, rol, provincia) — MUST NOT basarse en un
  valor cacheado en el token o la sesión que pueda haber quedado
  desactualizado desde el login.
- **FR-003**: El sistema MUST rechazar de forma explícita y distinguible
  (no degradar silenciosamente) cualquier operación que no cumpla las
  reglas de autorización definidas en esta especificación.
- **FR-004**: El sistema MUST NOT permitir ninguna operación de lectura o
  escritura, sobre ninguna de las entidades cubiertas, a un solicitante no
  autenticado.

**Autenticación e identidad (Principios III, IV, V)**

- **FR-005**: El sistema MUST ofrecer al menos tres métodos de
  autenticación desde el lanzamiento: credenciales locales (usuario y
  contraseña), Google Sign-In, y magic link (enlace de un solo uso enviado
  por email). Ninguno de los tres MUST ser prerequisito para que los otros
  dos funcionen.
- **FR-006**: Toda contraseña local MUST almacenarse con un algoritmo de
  hashing diseñado para credenciales (bcrypt, argon2id o scrypt), con salt
  único por usuario. El sistema MUST NOT almacenar contraseñas en texto
  plano ni con un hash genérico sin salt, y MUST NOT exponer una contraseña
  en texto plano en logs, mensajes de error o respuestas de la API.
- **FR-007**: Todo token de magic link MUST ser de un solo uso y MUST
  expirar en un plazo corto (orden de minutos); MUST invalidarse
  inmediatamente tras su primer uso o al expirar, lo que ocurra primero.
- **FR-008**: El sistema SHOULD limitar los intentos de login fallidos por
  cuenta y por origen (rate limiting o bloqueo progresivo).
- **FR-009**: Cada usuario MUST resolver a un único id subrogado
  (`usuarios.id`), sin importar por cuál de los tres métodos inició sesión
  en un momento dado.
- **FR-010**: Vincular un nuevo método de autenticación a una cuenta
  existente MUST requerir verificación de la propiedad del email antes de
  habilitar el acceso combinado. El sistema MUST NOT fusionar
  automáticamente dos identidades solo porque comparten el mismo valor de
  email sin esa verificación.
- **FR-011**: Toda comparación de propiedad o pertenencia usada en las
  reglas de autorización de abajo (owner de un organismo, integrante de una
  lista de editores) MUST resolverse contra el id subrogado del usuario
  (`usuarios.id`), no contra el email como identificador de sesión — el
  email sigue siendo un atributo del usuario y el dato de comparación
  almacenado en `propietario_id`/`organismo_editores` a través del id, pero
  la fuente de identidad de la sesión activa es la sesión propia del
  backend, no un claim de Firebase.

**Organismos, unidades funcionales y taxonomía**

- **FR-012**: El sistema MUST permitir leer, editar o borrar un organismo
  únicamente a: su propietario, cualquier usuario en su lista de editores,
  o un usuario con rol admin.
- **FR-013**: El sistema MUST permitir crear un organismo a cualquier
  usuario autenticado, sin restricción de rol, siempre que la operación lo
  asigne a sí mismo como propietario. Decisión confirmada: se reimplementa
  igual que la regla real (Principio VI) — sin flujo de aprobación ni
  restricción de rol en el alta.
- **FR-014**: El sistema MUST aplicar a las unidades funcionales y a la
  evaluación taxonómica de un organismo exactamente el mismo control de
  acceso que a su organismo padre (FR-012) — MUST NOT definir para ellas
  una regla de autorización propia o distinta.

**Grupos de jueces (pools)**

- **FR-015**: El sistema MUST permitir leer, crear, editar o borrar un
  grupo de jueces únicamente a usuarios autenticados cuya provincia
  coincida con la provincia del grupo, o a un usuario con rol admin. MUST
  NOT aplicar aquí ningún concepto de propietario o editor individual.

**Usuarios**

- **FR-016**: El sistema MUST permitir editar el perfil de un usuario
  únicamente al propio usuario o a un usuario con rol admin.
- **FR-017**: El sistema MUST permitir a cualquier usuario autenticado leer
  el perfil completo (email, rol, provincia) de cualquier otro usuario, sin
  acotar a admin o al propio usuario. Decisión confirmada: se reimplementa
  igual que la regla real (Principio VI) — visibilidad amplia preservada tal
  cual.

**Localidades**

- **FR-018**: El sistema MUST permitir la lectura del catálogo de
  localidades a cualquier usuario autenticado.
- **FR-019**: El sistema MUST NOT ofrecer alta, edición ni borrado de
  localidades a través de esta API; ese mantenimiento ocurre por un proceso
  separado, fuera de este alcance.

### Key Entities *(include if feature involves data)*

- **Usuario**: identidad unificada del sistema (`usuarios.id`), con rol
  (`usuario_normal`/`admin`), provincia, y uno o más métodos de
  autenticación vinculados (credenciales locales, Google, magic link
  verificado). Es el sujeto de toda decisión de autorización.
- **Sesión**: emitida por este backend tras un login exitoso por
  cualquiera de los tres métodos; identifica al usuario por su id
  subrogado, no por un claim externo.
- **Credencial local**: contraseña con hash + salt, asociada a un usuario.
- **Token de magic link**: de un solo uso, con expiración corta, asociado a
  un email a verificar o a un login.
- **Organismo**: entidad gestionada por un referente; tiene un propietario
  y una lista de editores, ambos usuarios; punto de anclaje de la
  autorización de sus subcolecciones.
- **Unidad funcional / Evaluación taxonómica**: dependen de un organismo
  para su autorización — no tienen reglas propias.
- **Grupo de jueces (pool)**: asociado a una provincia; su autorización es
  por coincidencia de provincia con el usuario, no por ownership individual.
- **Localidad**: catálogo de solo lectura para todos los usuarios
  autenticados.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El 100% de las operaciones de lectura y escritura sobre
  organismos, unidades funcionales, evaluaciones taxonómicas, grupos de
  jueces, usuarios y localidades quedan sujetas a una verificación de
  autorización del lado del servidor — 0 rutas donde el control de acceso
  dependa únicamente del cliente.
- **SC-002**: En pruebas de acceso cruzado (usuario sin relación de
  propiedad/edición ni rol admin contra un organismo ajeno), el 100% de los
  intentos de lectura, edición o borrado se rechazan.
- **SC-003**: En pruebas de acceso a grupos de jueces con las tres
  combinaciones (misma provincia, provincia distinta, admin), el resultado
  de autorización coincide con la regla esperada en el 100% de los casos.
- **SC-004**: Un usuario que vincula un segundo método de autenticación a
  un email ya verificado resuelve al mismo id subrogado en el 100% de los
  logins posteriores por cualquiera de los métodos vinculados.
- **SC-005**: 0 solicitudes no autenticadas reciben datos de organismos,
  unidades funcionales, evaluaciones taxonómicas, grupos de jueces, usuarios
  o localidades.
- **SC-006**: El 100% de los intentos de reutilizar un magic link ya usado,
  o de usar uno expirado, se rechazan.
- **SC-007**: Al remover a un usuario de la lista de editores de un
  organismo, ese usuario pierde la capacidad de operar sobre ese organismo
  en su siguiente solicitud, sin requerir cierre e inicio de sesión.
- **SC-008**: El 100% de las contraseñas almacenadas usa un algoritmo de
  hashing con salt por usuario; 0 contraseñas recuperables en texto plano
  desde el almacenamiento, desde logs o desde una respuesta de error.

## Assumptions

- El frontend nuevo (fuera de esta spec) consume exclusivamente esta API;
  no vuelve a hablar directo con la base de datos.
- "Referentes del foro" son los mismos actores que hoy cargan datos vía la
  app actual sobre Firestore: propietarios/editores de organismos,
  referentes provinciales de grupos de jueces, y administradores. Esta spec
  no agrega roles nuevos más allá de los ya presentes en el modelo migrado
  (`usuario_normal`, `admin`).
- El modelo de datos relacional y la identidad por id subrogado de
  `001-modelo-datos-relacional` (`usuarios`, `organismos`,
  `organismo_editores`, `unidad_funcional_grupo_jueces`, etc.) son la base
  sobre la que opera esta API; esta spec no redefine ese modelo, lo
  consume.
- Las reglas traducidas en esta spec provienen de la lectura íntegra de
  `docs/firestore-rules-actuales.rules` (Principio VI) — no de `SPEC.md` ni
  de un resumen de memoria. Cualquier apartamiento de esas reglas queda
  marcado explícitamente como [NEEDS CLARIFICATION] en vez de decidirse
  por defecto, dado que es una superficie de seguridad/privacidad.
- El pipeline de reporting hacia el público (BigQuery/Looker Studio) sigue
  operando como hoy, fuera de esta API, y no se modifica en esta spec.
- No existe, ni se agrega en esta spec, ningún endpoint de lectura pública
  o anónima — la comunicación pública de resultados es responsabilidad del
  foro, vía reportes, fuera de este sistema.
