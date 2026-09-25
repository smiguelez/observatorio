# Feature Specification: Backend de identidad y autorización — cierre de los hallazgos de seguridad de 002/005/006

**Feature Branch**: `007-identidad-autorizacion`

**Created**: 2026-09-25

**Status**: Draft

**Input**: User description: "Especificá el backend de identidad y autorización que cierra los hallazgos de seguridad acumulados en 002/005/006 — Fase A del plan hacia producción (docs/plan-camino-a-produccion.md). BLOQUEANTE — seguridad: (1) D14: rechazar la creación de identidad para cualquier email que no exista ya en usuarios, por cualquiera de los tres métodos (contraseña, Google, magic link), sin excepción por método; (2) D20: restringir a admin la escritura de provinciaId en PATCH /api/usuarios/:id, con 403 explícito ante el intento de un no-admin (nunca ignorar en silencio); (3) G1: endpoint para cambiar el rol de un usuario, admin únicamente. BLOQUEANTE — funcionalidad ya prometida por el frontend (005): (4) G3: flujo para que un usuario con contraseña pueda cambiarla y para completar el alta administrada; (5) alta administrada de usuarios (email, provincia, rol inicial). MISMO LOTE, no bloqueante: (6) generalizar el manejo de errores de integridad a los dos 500 de la verificación de 005 (borrado de un pool en uso, alta de UF con localidad inexistente); (7) mensajes de rechazo de los triggers de taxonomía identificables por un humano (FR-009 de 004). Fuera de alcance: envío real de email (Fase C), casing inconsistente (D13), cualquier pantalla de frontend (Fase B)."

## Contexto

`002-backend-api-carga-datos` construyó la autenticación (contraseña, Google
y enlace por email) y la autorización server-side sobre el modelo relacional
migrado; `005-frontend-cliente` y `006-backend-endpoints-faltantes` la
consumieron y, al verificarla contra el backend real, dejaron **hallazgos
abiertos** registrados en `docs/decisiones-pendientes.md` (D14, D16, D18, D20)
y en `specs/005-frontend-cliente/` (G1, G3). Esta feature —`Fase A` de
`docs/plan-camino-a-produccion.md`— los cierra **antes** de exponer el sistema
a usuarios reales. Es la única fase del plan que toca autenticación real.

Estado verificado hoy (contra el código de `reformulacion`, no supuesto —
Principio VII):

- **Cualquiera puede crearse una identidad.** El alta por contraseña, por
  Google o por enlace con **cualquier** email crea al usuario en `usuarios`
  (D14). Hoy el sistema es en la práctica de registro abierto, aunque la
  intención declarada es que solo un admin dé de alta.
- **El alta por contraseña sobre un email ya provisionado tampoco verifica
  quién es su dueño.** Los usuarios migrados existen en `usuarios` pero aún no
  tienen credenciales de acceso. **Verificado el 2026-09-25 contra el backend
  real con un usuario de prueba dado de alta que nunca había ingresado**: un
  registro público con contraseña sobre su email respondió `200` y entregó una
  **sesión iniciada como ese usuario** (con el mismo identificador), sin ninguna
  verificación del email. Es decir, quien conozca el email de cualquier usuario
  migrado puede quedarse con su cuenta antes de que el dueño real ingrese.
  Cerrar solo "email no provisionado" (D14 literal) **no** cierra este caso —
  ver FR-004. (En la misma prueba, el registro con un email **no** dado de alta
  también creó el usuario, confirmando D14.) Los datos de la prueba se
  eliminaron.
- **Cualquier usuario puede cambiarse la provincia** (D20) y con eso gana
  lectura y escritura sobre los pools de jueces de esa provincia, porque esa
  autorización se decide por la provincia del usuario. Es una debilidad
  heredada: las reglas originales de Firestore ya permitían que cada usuario
  escribiera su propio documento; `002` la portó para la provincia (y cerró la
  del rol).
- **No existe forma de cambiar el rol de un usuario** (G1) ni de darle de alta
  con un rol inicial; los admins actuales se cargaron por migración.
- **No hay forma de fijar o cambiar una contraseña desde el cliente** (G3) ni
  de restablecerla: el sistema no envía correo real todavía.
- **Dos rechazos de integridad llegan al cliente como `500`** (D16): borrar un
  pool que tiene asignaciones, y dar de alta una unidad funcional con una
  localidad inexistente.
- **Los mensajes de los triggers de taxonomía nombran la pregunta por su id
  interno** (D18), que la API nunca expone: FR-009 de `004` solo se cumple en
  parte.

**Fuera de alcance explícito:**
- Envío real de correo (infraestructura aparte, Fase C): el magic link sigue
  registrándose en el log y el alta administrada no depende de que salga un
  correo.
- El casing inconsistente entre endpoints (D13): decisión ya tomada de no
  tocarlo.
- **Cualquier pantalla o cambio de frontend** (Fase B, feature aparte).
- Baja, suspensión o borrado de usuarios; log de auditoría de altas y cambios
  de rol (ítem 4 del backlog); rol `supervisor_provincial` (ítem 1);
  solicitud de acceso con aprobación (ítem 9); rate limiting de login (D10, Fase E).
- Cargar los enunciados reales de las preguntas de taxonomía (D19: es un dato,
  no un comportamiento) — el punto 7 corrige **cómo se identifica** la pregunta
  en el rechazo, no el contenido de su texto.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Solo una persona ya dada de alta puede obtener una identidad (Priority: P1)

Como responsable del sistema, quiero que nadie pueda crearse una cuenta por su
cuenta —ni con contraseña, ni con Google, ni con un enlace por email—, para que
solo entren las personas que un administrador autorizó y el control de acceso
sea real y no dependa de que nadie conozca la URL.

**Why this priority**: es la puerta de entrada de todo el sistema. Mientras
esté abierta, cualquier otra restricción de autorización se puede eludir
creándose un usuario nuevo. Es un bloqueante de seguridad para el corte a
producción.

**Independent Test**: intentar el ingreso con un email que **no** figura entre
los usuarios dados de alta, por cada uno de los tres métodos, y comprobar que
ninguno crea un usuario ni una sesión; luego ingresar por un método válido con
un usuario dado de alta y comprobar que entra a **su** cuenta.

**Acceptance Scenarios**:

1. **Given** un email que no figura entre los usuarios dados de alta, **When**
   alguien intenta darse de alta con contraseña, **Then** el intento se rechaza,
   no se crea ningún usuario ni credencial, y no se obtiene ninguna sesión.
2. **Given** un email que no figura entre los usuarios dados de alta, **When**
   alguien intenta ingresar con Google usando una cuenta con ese email,
   **Then** el ingreso se rechaza sin crear usuario y la persona vuelve a la
   pantalla de ingreso con un mensaje que no revela si el email existe.
3. **Given** un email que no figura entre los usuarios dados de alta, **When**
   alguien pide un enlace de ingreso para ese email, **Then** la respuesta que
   recibe es **indistinguible** de la de un email válido, pero no se genera ni
   registra ningún enlace utilizable y no se crea ningún usuario.
4. **Given** uno de los usuarios ya dados de alta (incluidos los 47 migrados,
   que aún no tienen credenciales), **When** ingresa por Google o por enlace con
   su email, **Then** entra a su cuenta existente —con su misma identidad,
   organismos, rol y provincia—, sin duplicar el usuario.
5. **Given** un email dado de alta pero cuyo dueño nunca ingresó, **When**
   alguien lo registra con una contraseña propia, **Then** el intento se
   rechaza: una contraseña solo se establece por el flujo de primer acceso
   (US4/US5) o por su dueño ya autenticado — nunca por quien solo conoce el
   email.
6. **Given** un email dado de alta escrito con otras mayúsculas o con espacios
   alrededor, **When** se intenta ingresar, **Then** se trata como el mismo
   usuario (sin crear uno nuevo).

---

### User Story 2 - Solo un administrador puede asignar la provincia de un usuario (Priority: P1)

Como responsable del sistema, quiero que la provincia de un usuario —que
determina a qué pools de jueces accede— solo la pueda escribir un
administrador, para que nadie amplíe su propio alcance cambiándose de provincia.

**Why this priority**: es un problema de **autorización**, no de experiencia de
uso: hoy cualquier usuario autenticado lee y modifica los pools de cualquier
provincia con solo cambiar un campo de su perfil. Por su naturaleza es la deuda
de mayor prioridad de la fase (D20).

**Independent Test**: como usuario normal, intentar cambiarse la provincia y
comprobar el rechazo explícito y que nada cambió; como admin, cambiar la
provincia de ese usuario y comprobar que el cambio rige en su siguiente
solicitud.

**Acceptance Scenarios**:

1. **Given** un usuario no administrador, **When** intenta cambiar su propia
   provincia por otra distinta, **Then** recibe un rechazo **explícito** (`403`
   con un mensaje que explica que la provincia solo la asigna un
   administrador) y su provincia no cambia.
2. **Given** un no administrador que en la misma solicitud cambia su nombre y
   su provincia, **When** se envía, **Then** la solicitud se rechaza **completa**
   (ni siquiera el nombre se modifica): nunca se aplica a medias.
3. **Given** un no administrador que reenvía su provincia **actual** sin
   cambiarla (por ejemplo, un formulario que la manda siempre), **When** se
   envía junto con otros datos permitidos, **Then** los otros datos se guardan
   y la respuesta refleja la provincia sin cambios — no hay ningún cambio que
   rechazar, y nada se ignora en silencio.
4. **Given** un administrador, **When** asigna o cambia la provincia de
   cualquier usuario, **Then** el cambio se guarda y rige desde la solicitud
   siguiente de ese usuario, sin que tenga que volver a iniciar sesión.
5. **Given** un usuario al que un administrador le cambió la provincia,
   **When** consulta o modifica pools, **Then** ve y opera solo los de su
   provincia nueva (y ya no los de la anterior).
6. **Given** una provincia que no existe, **When** un administrador intenta
   asignarla, **Then** se rechaza con un mensaje claro (nunca un error de
   servidor).

---

### User Story 3 - Un administrador puede cambiar el rol de un usuario (Priority: P1)

Como administrador, quiero poder otorgar o quitar el rol de administrador a un
usuario, para gestionar quién tiene permisos de administración sin tocar la base
a mano.

**Why this priority**: hoy los administradores solo se pueden cargar por
migración o por acceso directo a la base; sin este cambio no hay forma
controlada de delegar ni de revocar administración (G1). Es un bloqueante de
seguridad porque la revocación urgente de un admin es una operación de
seguridad.

**Independent Test**: como admin, promover a un usuario normal y comprobar que
en su siguiente solicitud ya puede usar funciones de admin; degradarlo y
comprobar que las pierde de inmediato; como no admin, intentarlo y comprobar el
rechazo.

**Acceptance Scenarios**:

1. **Given** un administrador y un usuario normal, **When** el administrador le
   otorga el rol de administrador, **Then** en la **siguiente** solicitud de ese
   usuario ya tiene permisos de administración, sin re-login.
2. **Given** un administrador y otro administrador, **When** se le quita el rol,
   **Then** en su siguiente solicitud ya no puede usar funciones de admin y
   vuelve a ser usuario normal.
3. **Given** un usuario no administrador, **When** intenta cambiar el rol de
   cualquier usuario (incluido el suyo), **Then** recibe `403` con un mensaje
   claro y nada cambia.
4. **Given** el **único** administrador que queda en el sistema, **When**
   alguien (incluido él mismo) intenta quitarle el rol, **Then** se rechaza con
   un mensaje que explica que el sistema no puede quedarse sin administradores.
5. **Given** un rol que no existe o un usuario que no existe, **When** se
   intenta el cambio, **Then** se rechaza con un mensaje claro (nunca un error
   de servidor).
6. **Given** un cambio de rol exitoso, **When** se consulta al usuario
   afectado, **Then** su ficha muestra el rol actual.

---

### User Story 4 - Un administrador da de alta a un usuario nuevo y este puede ingresar por primera vez (Priority: P2)

Como administrador, quiero dar de alta a una persona indicando su email, su
provincia y su rol inicial, y darle un modo de ingresar por primera vez sin
depender de que salga un correo, para poder incorporar usuarios ahora que
nadie puede darse de alta solo.

**Why this priority**: es la consecuencia directa de US1: si nadie se
autoprovisiona, sin este flujo **no se puede agregar a nadie**, con lo cual
debe entregarse junto con US1. Depende de US1 para tener sentido, por eso no
es P1 por sí sola; es bloqueante de funcionalidad, no de seguridad.

**Independent Test**: como admin, dar de alta un email nuevo con provincia y
rol; comprobar que aparece entre los usuarios; obtener el acceso inicial,
usarlo como el nuevo usuario y comprobar que entra a su cuenta con la
provincia y el rol asignados; comprobar que el acceso inicial no sirve por
segunda vez.

**Acceptance Scenarios**:

1. **Given** un administrador, **When** da de alta un email que no existe
   indicando provincia y rol inicial, **Then** el usuario queda registrado con
   esos datos y el administrador recibe el **acceso inicial** para entregarle.
2. **Given** el acceso inicial entregado, **When** la persona lo usa por
   primera vez, **Then** puede fijar su contraseña inicial y queda con una
   sesión iniciada en su cuenta, con la provincia y el rol que el administrador
   le asignó.
3. **Given** un acceso inicial ya usado o vencido, **When** alguien lo usa,
   **Then** se rechaza con un mensaje claro y no otorga ninguna sesión ni
   permite fijar contraseña.
4. **Given** un email que ya está dado de alta, **When** un administrador
   intenta darlo de alta de nuevo, **Then** se rechaza con un mensaje que lo
   explica, sin duplicar ni modificar al usuario existente.
5. **Given** un usuario no administrador, **When** intenta dar de alta a
   alguien, **Then** recibe `403` y no se crea nada.
6. **Given** un usuario dado de alta que perdió su acceso inicial o su
   contraseña, **When** un administrador emite un acceso inicial nuevo,
   **Then** el anterior deja de servir y el nuevo permite volver a fijar la
   contraseña.
7. **Given** una persona dada de alta por un administrador que **más adelante**
   ingresa también por Google o por enlace, **When** lo hace, **Then** su
   contraseña sigue siendo válida (ingresar por otro método no la invalida en
   silencio).
8. **Given** una provincia inexistente, un rol inexistente o un email con
   formato inválido, **When** un administrador intenta el alta, **Then** se
   rechaza con un mensaje claro y no se crea nada.

---

### User Story 5 - Un usuario con contraseña puede cambiarla desde la aplicación (Priority: P2)

Como usuario que ingresa con contraseña, quiero poder cambiarla informando la
actual, para mantener mi cuenta protegida sin pedir ayuda a un administrador.

**Why this priority**: `005` ya promete esta función en el perfil (US6) pero el
servidor no la ofrece completa: el cambio de contraseña exige un flujo que el
cliente puede invocar (G3). Junto con el primer acceso de US4 completa el
manejo de contraseñas.

**Independent Test**: como usuario con contraseña, cambiarla informando la
actual correcta y comprobar que la siguiente autenticación exige la nueva y
rechaza la vieja; intentar con la actual incorrecta y comprobar el rechazo.

**Acceptance Scenarios**:

1. **Given** un usuario con contraseña y sesión iniciada, **When** informa su
   contraseña actual correcta y una nueva válida, **Then** la contraseña
   cambia; la siguiente vez que ingrese por contraseña, la nueva funciona y la
   anterior no.
2. **Given** una contraseña actual incorrecta, **When** intenta el cambio,
   **Then** se rechaza con un mensaje claro y la contraseña no cambia.
3. **Given** una contraseña nueva que no cumple la política mínima, **When**
   intenta el cambio, **Then** se rechaza con un mensaje que dice qué falta.
4. **Given** un cambio de contraseña exitoso, **When** existían otras sesiones
   abiertas de esa persona en otros dispositivos, **Then** esas sesiones dejan
   de ser válidas y la sesión desde la que se cambió sigue activa.
5. **Given** un usuario que ingresa solo por Google o por enlace y no tiene
   contraseña, **When** intenta cambiarla informando una "actual", **Then** se
   rechaza con un mensaje claro que explica que su cuenta no usa contraseña; la
   forma de tener una es el primer acceso emitido por un administrador (US4).

---

### User Story 6 - Los rechazos de integridad llegan como mensajes claros, no como errores de servidor (Priority: P3)

Como usuario de la aplicación, quiero que cuando una operación no se puede
hacer porque choca con otros datos —borrar un pool que todavía está asignado a
unidades funcionales, o dar de alta una unidad funcional con una localidad que
no existe— me llegue un mensaje que me diga qué pasó y qué hacer, en vez de un
error genérico de servidor.

**Why this priority**: no es de seguridad, pero hoy esos dos casos devuelven
`500` (D16) y obligan al cliente a *adivinar* la causa. Se agrupa con esta
feature porque toca el mismo manejo de errores que `006` ya generalizó para
asignaciones y editores.

**Independent Test**: intentar borrar un pool con asignaciones y crear una
unidad funcional con una localidad inexistente, y comprobar que ambos
responden un rechazo de cliente con un mensaje claro y que el dato no cambió.

**Acceptance Scenarios**:

1. **Given** un pool asignado a una o más unidades funcionales, **When** se
   intenta borrarlo, **Then** se rechaza con un mensaje que dice que el pool
   está en uso por unidades funcionales y que debe quitarse de ellas primero, y
   el pool sigue existiendo.
2. **Given** una localidad que no existe, **When** se da de alta o se modifica
   una unidad funcional con ella, **Then** se rechaza con un mensaje que
   identifica que la localidad indicada no existe, y no se crea ni cambia nada.
3. **Given** cualquier otro dato inexistente enviado por el cliente en las
   operaciones de escritura ya existentes (por ejemplo una denominación
   simplificada, un tipo de oficina o una provincia que no existen), **When**
   se envía, **Then** también se rechaza con un mensaje claro y no con un error
   de servidor.
4. **Given** un error realmente inesperado (una falla del servidor o de la base
   que no proviene de datos del cliente), **When** ocurre, **Then** sigue
   respondiendo error de servidor — solo lo causado por el cliente pasa a ser
   rechazo de cliente.

---

### User Story 7 - Un rechazo de taxonomía identifica la pregunta de forma que una persona la reconozca (Priority: P3)

Como usuario que completa la taxonomía de un organismo, quiero que cuando el
servidor rechaza una respuesta me diga **qué pregunta** tuvo el problema y por
qué, con un texto que yo pueda entender, para poder corregirla.

**Why this priority**: `FR-009` de `004` y de `005` piden identificar la
pregunta con problema y hoy solo se cumple en parte, porque el mensaje usa un
id interno que ni la API expone ni una persona reconoce (D18). No es de
seguridad; se agrupa por tocar el mismo código de rechazos.

**Independent Test**: provocar cada tipo de rechazo de taxonomía y comprobar
que el mensaje nombra la pregunta con su identificador público y su texto, sin
ningún id interno ni nombre de tabla.

**Acceptance Scenarios**:

1. **Given** una respuesta a una pregunta que no aplica al tipo del organismo,
   **When** se guarda, **Then** el rechazo identifica la pregunta con su
   identificador público y su texto, explica en lenguaje claro que no aplica a
   ese tipo de organismo, y no contiene ningún id interno ni nombre de tabla.
2. **Given** una opción que no pertenece a la pregunta respondida, un valor de
   un tipo que la pregunta no admite, o dos respuestas a una pregunta de opción
   única, **When** se guarda, **Then** en cada caso el rechazo identifica **la
   pregunta** y qué regla se violó, de la misma forma.
3. **Given** el mismo rechazo, **When** lo recibe un cliente que no es una
   persona (una pantalla), **Then** la respuesta trae la pregunta también en un
   campo separado y utilizable (su identificador público), además del mensaje
   legible, para poder resaltarla sin interpretar texto libre.
4. **Given** varias respuestas inválidas en un mismo guardado, **When** se
   rechaza, **Then** se informa **al menos la primera** identificada sin
   ambigüedad (no se exige listarlas todas).

---

### Edge Cases

- Un email dado de alta con mayúsculas o espacios distintos al ingresar: mismo
  usuario, nunca uno nuevo (US1-6).
- Ingreso con Google con una cuenta cuyo email **no** coincide con el usuario
  dado de alta: se rechaza (no se vincula por nombre ni por otro dato).
- Dos solicitudes simultáneas de alta para el mismo email: se crea **uno**
  solo; la otra recibe el rechazo de "ya existe".
- Un acceso inicial usado dos veces a la vez: solo el primero tiene efecto.
- Un administrador que se quita el rol a sí mismo cuando **hay otros**
  administradores: se permite; si es el único, se rechaza (US3-4).
- Un cambio de rol o de provincia mientras el usuario afectado tiene una sesión
  abierta: rige en su **siguiente** solicitud (la identidad se relee en cada
  pedido), sin re-login.
- Un no administrador que reenvía la provincia que ya tiene: no es un intento
  de cambio; no se rechaza (US2-3).
- El rechazo de un intento de alta o de ingreso no debe revelar si un email
  existe (mensajes uniformes) ni dejar filas parciales en ninguna tabla de
  identidad.
- Una persona dada de alta que nunca completó el primer acceso: puede seguir
  ingresando por Google o por enlace; el acceso inicial no es la única puerta.
- Un pool que está asignado solo a la unidad funcional que se está eliminando
  en la misma operación: fuera de alcance (el borrado de la UF ya elimina sus
  asignaciones; no se cambia ese comportamiento).
- Un rechazo de taxonomía en el que la pregunta no tiene texto legible cargado
  (D19: hoy el texto es igual al identificador): el mensaje muestra el
  identificador público y el texto tal como esté, sin inventar contenido.

## Requirements *(mandatory)*

### Functional Requirements

**Identidad — solo personas dadas de alta (US1)**

- **FR-001**: El sistema MUST rechazar la creación de una identidad de acceso
  para cualquier email que no figure ya entre los usuarios dados de alta, por
  **cualquiera** de los tres métodos (contraseña, Google, enlace por email),
  **sin excepción por método**.
- **FR-002**: Un rechazo por FR-001 MUST NOT crear ningún usuario, credencial,
  cuenta vinculada ni sesión, y MUST NOT dejar filas parciales en ninguna tabla
  de identidad.
- **FR-003**: Los mensajes y respuestas de un rechazo por FR-001 MUST NOT
  revelar si el email existe o no; en particular, la respuesta a un **pedido de
  enlace** para un email no dado de alta MUST ser indistinguible de la de uno
  dado de alta, sin generar ni registrar un enlace utilizable.
- **FR-004**: El sistema MUST NOT permitir que una contraseña quede
  establecida por alguien que solo conoce el email. En particular, MUST NOT
  existir ningún alta pública por contraseña —ni siquiera para un email ya
  dado de alta cuyo dueño nunca ingresó—; una contraseña solo se fija por el
  primer acceso emitido por un administrador (FR-016) o por su dueño ya
  autenticado (FR-018).
- **FR-005**: El sistema MUST permitir el ingreso, por Google y por enlace, de
  **todos** los usuarios ya dados de alta —incluidos los migrados que aún no
  tienen credenciales—, vinculándolos a su identidad existente (mismo
  identificador, organismos, rol y provincia) sin duplicarla.
- **FR-006**: La comparación del email MUST ignorar mayúsculas/minúsculas y
  espacios alrededor, y un email MUST corresponder a **un solo** usuario.
- **FR-007**: El ingreso con Google MUST exigir que el email de la cuenta de
  Google coincida con el de un usuario dado de alta; ningún otro dato (nombre,
  identificador de Google) MUST bastar para vincular.

**Autorización — provincia y rol (US2, US3)**

- **FR-008**: El sistema MUST permitir escribir la provincia de un usuario
  **únicamente a un administrador**.
- **FR-009**: Cuando un no administrador intente **cambiar** la provincia
  (enviar un valor distinto del actual), el sistema MUST rechazar la solicitud
  completa con `403` y un mensaje explícito, sin aplicar ninguno de los otros
  cambios de esa misma solicitud. MUST NOT responder éxito con el cambio
  ignorado.
- **FR-010**: Reenviar la provincia **actual** sin cambiarla MUST NOT contar
  como intento de cambio: la solicitud se procesa normalmente y la respuesta
  refleja la provincia sin cambios.
- **FR-011**: Un cambio de provincia hecho por un administrador MUST regir
  desde la siguiente solicitud del usuario afectado, sin re-login, tanto para
  el acceso a pools de jueces como para cualquier otra decisión que dependa de
  la provincia.
- **FR-012**: El sistema MUST ofrecer una operación, **solo para
  administradores**, que otorgue o quite el rol de administrador a un usuario;
  un no administrador MUST recibir `403` y nada cambia.
- **FR-013**: Un cambio de rol MUST regir desde la siguiente solicitud del
  usuario afectado, sin re-login.
- **FR-014**: El sistema MUST rechazar, con un mensaje claro, quitar el rol de
  administrador al **último** administrador que queda, sea quien sea el que lo
  intente.
- **FR-015**: Un rol o un usuario inexistente, o una provincia inexistente,
  MUST rechazarse con un mensaje claro y no con un error de servidor.

**Alta administrada y contraseñas (US4, US5)**

- **FR-016**: El sistema MUST ofrecer una operación, **solo para
  administradores**, que dé de alta un usuario a partir de **email, provincia
  y rol inicial**, y que le entregue al administrador un **acceso inicial**
  (de un solo uso y con vencimiento) para que se lo haga llegar a la persona,
  sin depender de que el sistema envíe un correo.
- **FR-017**: Quien use un acceso inicial válido MUST poder **fijar su
  contraseña inicial** y quedar con una sesión iniciada en su cuenta; un acceso
  inicial usado, vencido, reemplazado o inexistente MUST rechazarse con un
  mensaje claro y no otorgar sesión ni permitir fijar contraseña.
- **FR-018**: Un usuario con contraseña y sesión iniciada MUST poder cambiarla
  informando la contraseña actual; con una actual incorrecta, o una nueva que
  incumpla la política mínima, MUST rechazarse con un mensaje claro y sin
  cambios. Tras el cambio, las **demás** sesiones de esa persona MUST dejar de
  ser válidas y la actual sigue activa.
- **FR-019**: El sistema MUST rechazar el alta administrada de un email que ya
  está dado de alta, sin modificarlo ni duplicarlo; y MUST permitir a un
  administrador **emitir un acceso inicial nuevo** para un usuario existente,
  que deja sin efecto el anterior (para quien perdió su contraseña o su acceso).
- **FR-020**: Una contraseña fijada por el acceso inicial MUST seguir siendo
  válida cuando la misma persona ingrese más adelante por Google o por enlace
  (ingresar por otro método no MUST invalidarla en silencio).
- **FR-021**: Las operaciones de alta, de emisión de acceso inicial y de cambio
  de rol o provincia MUST validar sus datos (formato de email, provincia y rol
  existentes) y rechazar los inválidos con un mensaje claro.
- **FR-022**: Un acceso inicial MUST NOT poder usarse como credencial
  permanente ni reutilizarse; MUST ser imposible de adivinar y MUST NOT
  quedar registrado en claro en los logs del servidor.

**Rechazos de integridad (US6)**

- **FR-023**: Borrar un pool que está asignado a unidades funcionales MUST
  rechazarse con un mensaje que diga que el pool está en uso y qué hacer, y el
  pool MUST seguir existiendo.
- **FR-024**: Dar de alta o modificar una unidad funcional con una localidad
  inexistente MUST rechazarse con un mensaje que identifique que la localidad
  no existe.
- **FR-025**: Todo rechazo de integridad **causado por datos del cliente** en
  las operaciones de escritura existentes (datos inexistentes, duplicados,
  valores fuera de regla) MUST responder como rechazo de cliente con un mensaje
  claro; solo las fallas realmente inesperadas siguen respondiendo error de
  servidor.

**Taxonomía (US7)**

- **FR-026**: Todo rechazo de un guardado de taxonomía originado en una regla
  de integridad de las respuestas MUST identificar la pregunta con su
  **identificador público** y su **texto**, en lenguaje que una persona
  entienda, y MUST NOT contener ids internos ni nombres de tablas o de
  restricciones.
- **FR-027**: La respuesta a ese rechazo MUST incluir, además del mensaje
  legible, la pregunta afectada en un campo separado y utilizable por un
  cliente (su identificador público).

**Transversales**

- **FR-028**: Ninguna de las operaciones nuevas o modificadas MUST permitir que
  el cliente fije quién es el usuario o qué permisos tiene: el servidor decide
  la identidad y el rol de cada solicitud (Principio II).
- **FR-029**: Los `401` (sin sesión) y `403` (sin permiso) MUST mantener las
  convenciones de `002`: `401` sin excepción para toda ruta de dominio sin
  sesión, `403` para el autenticado sin permiso.

### Key Entities *(include if feature involves data)*

- **Usuario dado de alta**: la persona autorizada a ingresar —identificada por
  su email, con provincia y rol—. Es la fuente de verdad de "quién puede
  entrar" (ya existe; esta feature cambia quién puede crearlo).
- **Identidad de acceso**: el vínculo entre una persona dada de alta y los
  métodos con los que ingresa (contraseña, Google, enlace). Solo puede existir
  para un usuario dado de alta.
- **Rol**: administrador o usuario normal; decide qué operaciones puede hacer.
- **Provincia del usuario**: decide a qué pools de jueces accede; ahora la
  escribe solo un administrador.
- **Acceso inicial (primer acceso)**: credencial de un solo uso y con
  vencimiento, emitida por un administrador para una persona dada de alta, que
  permite fijar la contraseña inicial.
- **Rechazo de integridad / de taxonomía**: la respuesta de error, con mensaje
  legible y, en taxonomía, la pregunta afectada como dato estructurado.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El 100% de los intentos de obtener una identidad con un email no
  dado de alta —por contraseña, por Google y por enlace— se rechaza y deja **0
  filas nuevas** de usuario, credencial o sesión.
- **SC-002**: Los 47 usuarios ya dados de alta pueden ingresar (por enlace o
  por Google) sin perder ni duplicar su identidad, sus organismos, su rol ni su
  provincia: 47 de 47.
- **SC-003**: 0 emails dados de alta pueden quedar con una contraseña fijada
  por alguien que solo conoce el email: el 100% de los intentos de alta pública
  por contraseña se rechaza.
- **SC-004**: El 100% de los intentos de un no administrador de **cambiar** su
  provincia (o la de otro) recibe `403` con mensaje explícito y deja la
  provincia sin cambios; 0 respuestas de éxito con un cambio ignorado.
- **SC-005**: Un cambio de provincia o de rol hecho por un administrador rige
  en la **siguiente** solicitud del usuario afectado en el 100% de los casos,
  sin que este tenga que volver a iniciar sesión.
- **SC-006**: El 100% de los intentos de un no administrador de cambiar un rol
  o dar de alta a alguien recibe `403`; el sistema **nunca** queda con 0
  administradores.
- **SC-007**: Un administrador puede dar de alta a una persona y esta puede
  ingresar por primera vez y tener su contraseña en menos de 5 minutos, sin que
  intervenga ningún envío de correo; un acceso inicial ya usado o vencido no
  otorga acceso en el 100% de los casos.
- **SC-008**: Tras un cambio de contraseña exitoso, la contraseña anterior deja
  de servir y las demás sesiones de esa persona quedan cerradas en el 100% de
  los casos.
- **SC-009**: Las dos operaciones señaladas en `005` (borrar un pool en uso y
  dar de alta una UF con localidad inexistente) responden un rechazo de cliente
  con mensaje claro en el 100% de los casos, y **ningún** rechazo causado por
  datos del cliente en las operaciones de escritura revisadas responde error de
  servidor.
- **SC-010**: El 100% de los rechazos de taxonomía por regla de integridad
  identifica la pregunta por su identificador público y su texto, con **0**
  ids internos ni nombres de tablas en el mensaje.

## Assumptions

- **Fuente de verdad de "dado de alta"**: la tabla de usuarios existente. Los
  usuarios migrados ya están ahí (47), por lo que la restricción no deja a
  nadie afuera; los administradores actuales (3) tampoco.
- **Mensaje de rechazo de ingreso**: uniforme y genérico (el del frontend de
  `005` ya lo espera: "No se pudo iniciar sesión con este email. Si creés que
  deberías tener acceso, contactá a un administrador"), no uno que confirme si
  el email existe. D14 pedía "un mensaje claro": se interpreta como claro
  sobre **qué hacer**, no sobre **por qué** se rechazó, para no permitir
  descubrir qué emails están registrados.
- **Acceso inicial = enlace/código de un solo uso, entregado al administrador
  en la respuesta del alta** (no por correo, que es la Fase C). El
  administrador se lo hace llegar a la persona por su cuenta. Vence en un plazo
  corto (a fijar en el plan; se sugiere del orden de horas, no de minutos, dado
  que la entrega es manual) y se emite de nuevo si se pierde. Se acepta que el
  **administrador conoce el enlace** durante la entrega: es un canal de
  confianza y es la única forma de dar de alta sin correo real; cuando exista
  envío por correo (Fase C) el mismo flujo pasa a enviarse sin que lo vea el
  administrador.
- **La contraseña fijada por el acceso inicial no se pierde al ingresar luego
  por otro método**: se trata como una credencial legítima de una persona
  dada de alta por un administrador (el administrador "avala" el email). Esto
  evita repetir el comportamiento observado en `005`, donde verificar el email
  por enlace borraba en silencio una contraseña sin verificar.
- **Provincia obligatoria para el rol usuario normal, opcional para
  administrador**: la provincia decide el acceso a pools del usuario normal;
  un administrador accede a todos, por lo que puede no tener provincia. (Hoy
  los 47 usuarios tienen provincia.)
- **Protección del último administrador**: se asume la regla estándar de no
  permitir el bloqueo total; el autodescenso es válido si quedan otros
  administradores.
- **Política mínima de contraseña**: la que ya rige hoy (8 caracteres como
  mínimo); no se endurece en esta feature.
- **Cambio de contraseña cierra las demás sesiones**: práctica estándar de
  seguridad; se conserva la sesión desde la que se cambió.
- **Un no administrador que reenvía su provincia actual no es rechazado**
  (FR-010): mantiene compatible al formulario de perfil de `005` (que la envía
  siempre que tiene un valor) hasta que la Fase B lo adapte, sin abrir ningún
  camino de cambio. Un intento de **cambio** sí se rechaza completo (FR-009).
- **Impacto en pruebas y en el cliente existente (no es alcance, es
  consecuencia)**: las pruebas de `backend/` y las de extremo a extremo de
  `frontend/` crean usuarios de prueba mediante el alta pública por contraseña,
  que dejará de existir; tendrán que darlos de alta por el camino nuevo. El
  formulario de perfil de `005` que permitía elegir provincia dejará de poder
  cambiarla hasta la Fase B; eso es esperado y se documenta.
- **Alcance de FR-025**: cubre las operaciones de escritura **ya existentes**
  (organismos, unidades funcionales, pools, asignaciones, editores, usuarios,
  taxonomía). Se revisan sus referencias a datos del cliente; un caso adicional
  hallado en esa revisión entra en el mismo requisito y no requiere una nueva
  decisión.
- **Alcance de la taxonomía**: se corrige **cómo se identifica** la pregunta.
  El texto legible de cada pregunta depende de que se carguen los enunciados
  reales (D19, un dato aparte): mientras no estén, el mensaje muestra el
  identificador público y el texto tal como esté cargado.
- **Sin auditoría**: los cambios de rol y de provincia y las altas no generan
  un registro de auditoría en esta feature (ítem 4 del backlog); solo el
  registro técnico normal del servidor.
- **Fuera de esta feature**: cualquier pantalla (Fase B), el envío real de
  correo (Fase C), reporting (Fase D), despliegue y rate limiting (Fase E).
