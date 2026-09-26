# Feature Specification: Frontend — Fase B: consumir la identidad y autorización de 007

**Feature Branch**: `008-frontend-identidad-fase-b`

**Created**: 2026-09-25

**Status**: Draft

**Input**: User description: "Especificá la Fase B del frontend: actualizar 005-frontend-cliente para consumir lo que 007-identidad-autorizacion acaba de habilitar. No es una feature nueva desde cero — es un conjunto de cambios sobre pantallas ya existentes, más una pantalla nueva (canje de acceso inicial) que no existía porque el flujo que la origina no existía. Cambios sobre pantallas existentes: (1) Perfil: provincia de solo lectura para usuario_normal; el mensaje de 'sin provincia' en el alta de organismo pasa a 'pedile a un administrador que te asigne una provincia'. (2) Gestión de usuarios (US9 de 005, hoy de solo lectura): edición de rol y provincia para admin. (3) Diálogo de pools: leer el 400 con mensaje claro (D16) en lugar de detectar el 500/23503. (4) Formulario de taxonomía: el backend identifica la pregunta por código y texto (D18). Pantalla nueva: (5) alta administrada de usuarios con acceso inicial de un solo uso; (6) canje de acceso inicial — pantalla pública, única sin autenticación previa. Re-verificación: (7) SC-002 de 005 se redefine: el recorrido empieza después de que un admin asignó la provincia en el alta. Fuera de alcance: T030 (Google end-to-end, Fase E); envío real de email para el acceso inicial (Fase C)."

## Contexto

`005-frontend-cliente` construyó el cliente sobre el backend de `002`–`006` y dejó cuatro limitaciones **deliberadas**
porque el backend todavía no ofrecía lo necesario: gestión de usuarios en solo lectura (G1), sin forma de fijar una
contraseña (G3), sin alta de usuarios (G5) y el borrado de un pool en uso respondiendo `500` (G6). `007-identidad-autorizacion`
(mergeada en `reformulacion`, 2026-09-25) cerró las cuatro y además **cambió reglas** que el cliente actual asume.
Esta feature —**Fase B** de `docs/plan-camino-a-produccion.md`— adapta el cliente a ese nuevo comportamiento. **No modifica el backend.**

Estado verificado hoy contra el código de `frontend/` (no supuesto — Principio VII):

- **El perfil todavía deja elegir la provincia** (`src/routes/perfil/PerfilPage.tsx`) y la envía al guardar. Desde `007`, un
  usuario normal que **cambia** su provincia recibe un rechazo (`403`) y la solicitud entera se descarta; reenviar la
  provincia actual sigue siendo válido, por eso el formulario actual solo falla cuando alguien intenta cambiarla.
- **El aviso de "sin provincia" al dar de alta un organismo** dice "primero tenés que completar tu provincia en tu perfil"
  (`OrganismoNuevoPage.tsx`) y lleva al perfil, donde ya no se puede completar.
- **La pantalla de usuarios es de solo lectura** con un control "Cambiar rol" deshabilitado que dice "todavía no está
  disponible" (`AdminUsuariosPage.tsx`).
- **El borrado de un pool en uso se detecta por un `500` con código `23503`** (`src/api/pools.ts`, `PoolEnUsoError`). El
  backend ya no responde así: responde un rechazo de cliente (`400`) con un mensaje propio, por lo que esa detección
  **nunca se dispara** y hoy el usuario vería un mensaje genérico en lugar del claro.
- **El resaltado de la pregunta con problema en la taxonomía busca el código de la pregunta dentro del texto del error**
  (`preguntasDelError` en `src/features/taxonomia/mezclar.ts`). El backend ahora envía además la pregunta como dato
  separado (código y texto); el texto nuevo cita el código entre «», por lo que la búsqueda actual sigue funcionando *por
  coincidencia*, no por diseño.
- **No existe ninguna pantalla pública salvo el login** (`src/routes.tsx`): todo lo demás está detrás de la sesión. El
  enlace de acceso inicial que `007` habilita necesita, por definición, una pantalla sin sesión previa.
- **Las pruebas de extremo a extremo de `005` crean usuarios por el alta pública por contraseña**
  (`tests/e2e/helpers/backend.ts`, `crearUsuarioConClave`), que dejó de existir en `007`: hoy esas pruebas **no pueden
  crear sus usuarios** y hay que migrarlas al alta administrada.

**Fuera de alcance explícito:**
- **T030**: probar Google de punta a punta — bloqueado por una credencial OAuth real, no por código (Fase E).
- **Envío real de correo** del acceso inicial y del magic link (Fase C): el administrador comparte el enlace a mano.
- Cualquier cambio de backend. Si al construir esta feature aparece una brecha del servidor, se registra para una
  feature de backend aparte; no se corrige acá.
- Restablecer la contraseña por correo, baja/suspensión de usuarios, log de auditoría, solicitud de acceso con aprobación
  (ítem 9 del backlog), rol `supervisor_provincial`.
- Rate limiting del canje y del login (D10, Fase E).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - (admin) Dar de alta a una persona y entregarle su acceso inicial (Priority: P1)

Como administrador, quiero dar de alta a una persona indicando su email, su rol inicial y su provincia, y obtener un enlace
de acceso inicial para hacérselo llegar, para poder incorporar usuarios ahora que nadie puede darse de alta solo.

**Why this priority**: con `007`, sin esta pantalla **no se puede agregar a nadie** desde la aplicación; es el punto de
entrada de todo usuario nuevo y bloquea el recorrido de US2 y US5.

**Independent Test**: como admin, dar de alta un email nuevo con provincia y rol, ver el enlace de acceso y su vencimiento,
comprobar que la persona aparece en la lista de usuarios con esa provincia y ese rol, y que el enlace no vuelve a mostrarse
al cerrar el aviso.

**Acceptance Scenarios**:

1. **Given** un admin en la pantalla de usuarios, **When** completa email, rol y provincia y confirma, **Then** la persona
   queda dada de alta y el admin ve el **enlace de acceso inicial** listo para copiar, junto con su fecha y hora de
   vencimiento y un aviso de que **no volverá a mostrarse**.
2. **Given** el aviso con el enlace visible, **When** el admin lo copia, **Then** obtiene el enlace completo; **When** cierra
   el aviso, **Then** el enlace deja de estar disponible en la pantalla (no se guarda en ningún lado del navegador).
3. **Given** un rol "usuario normal", **When** el admin intenta confirmar sin provincia, **Then** se le indica que la
   provincia es obligatoria para ese rol y no se envía nada; con rol "administrador" la provincia es opcional.
4. **Given** un email que ya está dado de alta (aunque esté escrito con otras mayúsculas), **When** el admin confirma,
   **Then** ve el mensaje del servidor explicando que ya existe, y el usuario existente no se modifica.
5. **Given** un usuario existente que perdió su acceso o su contraseña, **When** el admin pide un acceso inicial nuevo,
   **Then** obtiene un enlace nuevo con el mismo aviso de un solo uso, y se le informa que el anterior **dejó de servir**.
6. **Given** un usuario sin rol de administrador, **When** intenta abrir esta pantalla o acción por dirección directa,
   **Then** recibe la misma respuesta que ante una pantalla inexistente (FR-016 de `005`).

---

### User Story 2 - Fijar mi contraseña y entrar por primera vez con el acceso inicial (Priority: P1)

Como persona a quien un administrador dio de alta, quiero abrir el enlace que me pasó, elegir mi contraseña y quedar dentro
de la aplicación, sin tener que esperar un correo ni conocer ninguna contraseña previa.

**Why this priority**: es la contraparte de US1; sin ella el enlace no sirve. Es además la **única pantalla de la app que se
abre sin sesión** (aparte del login), por lo que su cuidado es de seguridad, no solo de uso.

**Independent Test**: abrir un enlace de acceso válido sin sesión, fijar una contraseña, comprobar que se entra a la
aplicación con la provincia y el rol asignados; volver a abrir el mismo enlace y comprobar que no sirve.

**Acceptance Scenarios**:

1. **Given** una persona sin sesión con un enlace de acceso válido, **When** lo abre, **Then** ve un formulario para elegir
   su contraseña (con confirmación) y **la dirección visible ya no contiene el acceso**.
2. **Given** ese formulario, **When** ingresa una contraseña que cumple la política y confirma, **Then** queda con la sesión
   iniciada y es llevada a la pantalla principal, con la provincia y el rol que el admin le asignó; en su próximo ingreso
   puede entrar con esa contraseña.
3. **Given** una contraseña demasiado corta, larga, o cuya confirmación no coincide, **When** intenta enviar, **Then** se le
   dice qué falta **antes** de enviar nada al servidor.
4. **Given** un enlace ya usado, vencido, reemplazado por uno nuevo o inventado, **When** intenta canjearlo, **Then** ve **el
   mismo mensaje en todos los casos** (no distingue la causa) que le indica pedir un acceso nuevo a un administrador, y no
   queda con sesión ni con contraseña.
5. **Given** un enlace al que le falta el acceso (dirección incompleta), **When** se abre, **Then** ve ese mismo mensaje
   único, sin formulario que no pueda funcionar.
6. **Given** una persona que ya tiene una sesión abierta en ese navegador, **When** abre el enlace, **Then** se le avisa
   que continuar **cierra la sesión actual** y entra como la persona invitada, antes de enviar nada.
7. **Given** que el canje sale bien, **When** la persona vuelve atrás en el navegador, **Then** no reaparece el formulario
   con el acceso.

---

### User Story 3 - (admin) Cambiar el rol y la provincia de un usuario (Priority: P2)

Como administrador, quiero cambiar desde la lista de usuarios el rol y la provincia de cualquier persona, para gestionar
permisos y acceso a pools de jueces sin tocar la base a mano.

**Why this priority**: reemplaza el control hoy deshabilitado de `005` (US9). Cubre la revocación urgente de un admin, que es
una operación de seguridad, pero no bloquea el alta de usuarios de US1.

**Independent Test**: como admin, promover a un usuario normal y verificar que la lista lo muestra como admin; cambiarle
la provincia y verificar que la lista la refleja; intentar quitar el rol al último administrador y verificar que se rechaza
con el mensaje del servidor y la pantalla vuelve al estado real.

**Acceptance Scenarios**:

1. **Given** la lista de usuarios, **When** el admin otorga el rol de administrador a un usuario, **Then** la lista lo
   muestra con ese rol tras la confirmación del servidor.
2. **Given** un usuario administrador, **When** el admin le quita el rol, **Then** se le pide **confirmación explícita** antes
   de enviar, y tras confirmar la lista lo muestra como usuario normal.
3. **Given** el **único** administrador que queda, **When** se intenta quitarle el rol (incluso a sí mismo), **Then** ve el
   mensaje del servidor que explica que el sistema no puede quedarse sin administradores, y el rol mostrado sigue siendo el real.
4. **Given** un administrador que **se quita el rol a sí mismo** (habiendo otros administradores), **When** el servidor lo
   acepta, **Then** la app lo trata como usuario normal desde ese momento: deja de ver las pantallas de admin y no queda
   mostrando una pantalla que ya no le corresponde.
5. **Given** la lista, **When** el admin elige otra provincia para un usuario, **Then** la lista la muestra tras la
   confirmación; una provincia rechazada por el servidor se informa con su mensaje y no cambia nada.
6. **Given** un usuario cuyo rol o provincia cambió mientras tenía la app abierta, **When** sigue usándola, **Then** en su
   siguiente pantalla o acción rige el permiso nuevo, sin que tenga que volver a iniciar sesión.
7. **Given** un usuario que no es administrador, **When** intenta abrir la pantalla por dirección directa, **Then** recibe
   la respuesta de una pantalla inexistente (FR-016 de `005`).

---

### User Story 4 - La provincia la asigna un administrador: perfil y alta de organismo coherentes (Priority: P2)

Como usuario normal, quiero que la aplicación me muestre mi provincia sin ofrecerme cambiarla, y que si no tengo una me diga
claramente a quién pedírsela, para no intentar acciones que el servidor va a rechazar.

**Why this priority**: es una corrección de coherencia con una regla de autorización de `007`; hasta que se haga, el
formulario de perfil ofrece un cambio que termina en rechazo. No bloquea el alta de usuarios.

**Independent Test**: como usuario normal, abrir el perfil y comprobar que la provincia se ve pero no se puede modificar y
que guardar otros datos funciona; con un usuario sin provincia, abrir el alta de organismo y comprobar el mensaje nuevo.

**Acceptance Scenarios**:

1. **Given** un usuario normal en su perfil, **When** ve el dato de provincia, **Then** lo ve **de solo lectura**, con una
   nota que dice que la asigna un administrador; el resto de los datos (nombre, foto) siguen siendo editables.
2. **Given** ese usuario, **When** guarda cambios en su perfil, **Then** el guardado funciona y **no incluye la provincia**.
3. **Given** un administrador en su propio perfil, **When** ve la provincia, **Then** puede editarla (el servidor se lo permite).
4. **Given** un usuario normal **sin provincia** asignada, **When** entra al alta de organismo, **Then** ve un mensaje que
   dice **que le pida a un administrador que le asigne una provincia** (no "completá tu perfil") y no ve un formulario
   que no pueda enviar; el mensaje no lo lleva a una pantalla donde no puede resolverlo.
5. **Given** un usuario al que un administrador le acaba de asignar provincia, **When** vuelve a entrar al alta de
   organismo o al perfil, **Then** ve la provincia vigente, no la anterior.
6. **Given** un rechazo del servidor por provincia (defensa ante una diferencia entre pantalla y servidor), **When** ocurre,
   **Then** se muestra el mensaje del servidor y no queda ningún cambio a medias.

---

### User Story 5 - Recorrido completo de una persona nueva, después del alta del admin (Priority: P2)

Como persona recién incorporada, quiero poder, en una sola sesión, entrar por mi acceso inicial, dar de alta mi primer
organismo y completar su taxonomía, sin que la aplicación me pida decidir nada que ya decidió el administrador.

**Why this priority**: es la re-verificación de SC-002 de `005`, que **queda invalidado** tal como estaba probado: un usuario
nuevo ya no puede completar su propia provincia. Confirma que US1, US2 y US4 componen un recorrido real.

**Independent Test**: dar de alta como admin a una persona con provincia asignada; abrir su enlace como esa persona; dar de
alta un organismo y completar la taxonomía aplicable en la misma sesión.

**Acceptance Scenarios**:

1. **Given** una persona dada de alta con provincia asignada, **When** canjea su acceso inicial y entra, **Then** el
   organismo que crea ya lleva **su provincia asignada, fija**, y en ningún paso se le pide elegirla.
2. **Given** esa persona en la lista de organismos, **When** completa el alta y la taxonomía aplicable, **Then** lo logra
   sin recargar la página ni reingresar datos ya dados (misma exigencia que SC-002 original).
3. **Given** la definición vigente del recorrido, **When** se lo verifica, **Then** el punto de partida es "un admin ya
   asignó la provincia en el alta" y no "usuario nuevo sin datos".

---

### User Story 6 - El borrado de un pool en uso explica qué pasó (Priority: P3)

Como usuario que gestiona pools de jueces, quiero que si intento borrar un pool que todavía está asignado a unidades
funcionales, la aplicación me diga que está en uso y qué hacer, con las palabras que da el servidor.

**Why this priority**: hoy la detección del caso quedó **inerte** (se apoyaba en un error que el backend ya no devuelve), así
que el usuario vería un mensaje genérico. No es de seguridad, pero es una regresión silenciosa de `005` causada por `007`.

**Independent Test**: intentar borrar un pool con asignaciones y comprobar que aparece el mensaje del servidor y que el pool
sigue en la lista; quitar la asignación y comprobar que el borrado prospera.

**Acceptance Scenarios**:

1. **Given** un pool asignado a una o más unidades funcionales, **When** el usuario intenta borrarlo, **Then** ve el mensaje
   que devuelve el servidor (pool en uso, quitarlo primero de las asignaciones) y el pool sigue en la lista.
2. **Given** un pool sin asignaciones, **When** lo borra, **Then** desaparece de la lista con la confirmación de siempre.
3. **Given** cualquier otro rechazo con mensaje que el servidor devuelva al crear, editar o borrar un pool, **When** ocurre,
   **Then** el usuario ve ese mensaje; la aplicación **no deduce** causas a partir de códigos de error genéricos.

---

### User Story 7 - Un rechazo de taxonomía señala la pregunta con problema (Priority: P3)

Como usuario que completa la taxonomía de un organismo, quiero que cuando el servidor rechaza el guardado se resalte
exactamente la pregunta con problema y se me diga por qué, para corregirla sin buscar.

**Why this priority**: `007` (D18) hizo que el servidor identifique la pregunta con un dato propio; el cliente hoy la
encuentra buscando su código dentro de un texto, lo que funciona por coincidencia y es frágil.

**Independent Test**: provocar un rechazo de taxonomía (por ejemplo una opción que no corresponde) y comprobar que la
pregunta indicada por el servidor queda resaltada con el mensaje; provocar uno sin pregunta y comprobar que solo se muestra
el mensaje.

**Acceptance Scenarios**:

1. **Given** un rechazo que trae la pregunta afectada, **When** se lo recibe, **Then** esa pregunta queda resaltada y se
   muestra el mensaje del servidor, sin depender de buscar su código en el texto.
2. **Given** un rechazo sin pregunta asociada (por ejemplo, pregunta inexistente), **When** ocurre, **Then** se muestra solo
   el mensaje y no se resalta ninguna pregunta.
3. **Given** un rechazo que indica una pregunta que no está en el formulario mostrado, **When** ocurre, **Then** se muestra
   el mensaje y no falla la pantalla.
4. **Given** varios problemas en un mismo guardado, **When** el servidor informa el primero, **Then** el usuario ve ese; al
   corregirlo y reintentar puede aparecer el siguiente (el servidor no lista todos).

---

### Edge Cases

- El acceso inicial **no debe quedar** en el historial del navegador, en la barra de direcciones visible tras leerlo, ni en
  ningún almacenamiento del navegador; tampoco puede viajar en una parte de la dirección que llegue a los servidores.
- Una persona abre su enlace **dos veces a la vez** (dos pestañas): solo el primer canje tiene efecto; el segundo ve el
  mensaje único de acceso no válido.
- El enlace se comparte por un medio que lo **recorta o altera**: se trata como "falta el acceso" (mensaje único).
- El administrador cierra el aviso del enlace **sin haberlo copiado**: no hay forma de recuperarlo; debe emitir uno nuevo
  (el aviso lo advierte antes de cerrar).
- Un admin **repite el alta** de un email ya dado de alta: se le explica y se le ofrece emitir un acceso nuevo si lo que
  quiere es ayudar a esa persona a entrar.
- La sesión del admin vence mientras completa el alta: se aplica la regla de sesión vencida de `005` sin perder lo escrito.
- El admin cambia la provincia de una persona **mientras esa persona tiene la aplicación abierta**: rige en su siguiente
  acción, sin re-login; la pantalla no debe seguir ofreciéndole la provincia anterior como vigente.
- Un usuario es promovido a administrador **con su sesión abierta**: sus pantallas de admin aparecen sin re-login en su
  siguiente carga; si es degradado, desaparecen.
- La provincia de un usuario **no puede quitarse** una vez asignada (el servidor solo permite cambiarla): la pantalla no
  ofrece "sin provincia" para usuarios existentes.
- Un administrador **sin provincia** dando de alta un organismo: puede elegirla (regla de `005`, sin cambios).

## Requirements *(mandatory)*

### Functional Requirements

**Alta administrada y acceso inicial (US1)**

- **FR-001**: El sistema MUST permitir a un administrador dar de alta a una persona indicando email, rol inicial (administrador
  o usuario normal) y provincia; la provincia MUST ser obligatoria para el rol usuario normal y opcional para administrador.
- **FR-002**: Tras un alta exitosa, el sistema MUST mostrar al administrador el enlace de acceso inicial, listo para copiar,
  junto con su vencimiento y un aviso de que se muestra **una sola vez**.
- **FR-003**: El sistema MUST NOT conservar el acceso inicial más allá de esa vista: no debe persistirse en el navegador ni
  volver a mostrarse al cerrar el aviso; recuperar uno perdido MUST requerir emitir uno nuevo.
- **FR-004**: El sistema MUST permitir a un administrador emitir un acceso inicial nuevo para un usuario existente, e informar
  que el anterior dejó de servir.
- **FR-005**: El enlace de acceso MUST construirse de modo que el acceso viaje en una parte de la dirección que el navegador
  **no envía al servidor**.
- **FR-006**: Ante un rechazo del servidor en el alta o en la reemisión (email ya dado de alta, provincia o rol inexistente,
  email inválido), el sistema MUST mostrar el mensaje del servidor y MUST NOT dar la operación por hecha.
- **FR-007**: Las pantallas y acciones de alta y reemisión MUST estar disponibles solo para administradores, con la misma
  respuesta que una pantalla inexistente para quien no lo es (FR-016 de `005`); el servidor sigue siendo la barrera real.

**Canje del acceso inicial (US2)**

- **FR-008**: El sistema MUST ofrecer una pantalla **accesible sin sesión**, con dirección propia, que toma el acceso del
  enlace y permite elegir una contraseña con confirmación.
- **FR-009**: El sistema MUST validar en el cliente, antes de enviar, la política de contraseña vigente (mínimo 8 y máximo 128
  caracteres) y que la confirmación coincida, indicando qué falta.
- **FR-010**: Tras un canje exitoso el sistema MUST dejar a la persona con la sesión iniciada y llevarla a la pantalla principal,
  sin pedirle que reingrese su email ni su contraseña.
- **FR-011**: Ante un acceso usado, vencido, reemplazado, inexistente o ausente, el sistema MUST mostrar **un único mensaje**
  que no distingue la causa e indica pedir un acceso nuevo a un administrador; MUST NOT iniciar sesión ni fijar contraseña.
- **FR-012**: La pantalla MUST NOT revelar antes de enviar si el acceso es válido, ni mostrar datos de la persona a la que
  corresponde (email, provincia, rol).
- **FR-013**: Tras leer el acceso de la dirección, el sistema MUST quitarlo de la dirección visible y MUST NOT dejarlo en el
  historial ni en ningún almacenamiento del navegador; la contraseña MUST NOT persistirse ni registrarse en el cliente.
- **FR-014**: Si ya hay una sesión abierta, el sistema MUST avisar, antes de enviar, que continuar reemplaza esa sesión.
- **FR-015**: Esta pantalla MUST ser la **única excepción** a "toda pantalla requiere sesión" (FR-020 de `005`) además del
  login; MUST NOT existir enlace a ella desde el login ni ninguna forma de obtener un acceso sin un administrador
  (FR-022 de `005`, sin registro público, se mantiene).

**Gestión de usuarios (US3)**

- **FR-016**: El sistema MUST permitir a un administrador otorgar o quitar el rol de administrador a un usuario y cambiar la
  provincia de un usuario, desde la lista de usuarios, reemplazando el control deshabilitado y el aviso "no disponible" de `005`.
- **FR-017**: Quitar el rol de administrador MUST requerir confirmación explícita antes de enviarse.
- **FR-018**: Ante un rechazo del servidor (último administrador, provincia o rol inexistente, sin permiso), el sistema MUST
  mostrar su mensaje y MUST mostrar el estado real del usuario, no el intentado.
- **FR-019**: Tras un cambio exitoso el sistema MUST reflejarlo en la lista sin recargar la página.
- **FR-020**: Si un administrador se quita el rol a sí mismo, el sistema MUST tratarlo como usuario normal desde ese momento,
  quitándole el acceso a las pantallas de admin sin dejarlo en una pantalla que ya no le corresponde.
- **FR-021**: El sistema MUST usar siempre el rol y la provincia **vigentes** del usuario en sesión, de modo que un cambio hecho
  por un administrador rija en la siguiente pantalla o acción, sin re-login.
- **FR-022**: El sistema MUST NOT ofrecer quitar la provincia de un usuario existente (solo cambiarla).

**Perfil y alta de organismo (US4)**

- **FR-023**: El sistema MUST mostrar la provincia del usuario en su perfil **de solo lectura** para el rol usuario normal, con
  una nota de que la asigna un administrador; para un administrador MUST seguir siendo editable.
- **FR-024**: El guardado del perfil de un usuario normal MUST NOT incluir la provincia.
- **FR-025**: En el alta de organismo, para un usuario normal sin provincia, el sistema MUST mostrar un mensaje que indique pedir
  a un administrador que le asigne una provincia, en lugar de la indicación de completarla en el perfil, y MUST NOT ofrecer
  un formulario que no pueda enviarse (reemplaza el aviso del escenario 5 de US2 de `005`).
- **FR-026**: Ante un rechazo del servidor por provincia, el sistema MUST mostrar el mensaje del servidor y no dejar cambios
  parciales.

**Rechazos del servidor con mensaje (US6, US7)**

- **FR-027**: Ante un rechazo de cliente del servidor con mensaje en las operaciones sobre pools, el sistema MUST mostrar ese
  mensaje; MUST NOT inferir la causa a partir de un código de error genérico. En particular, el borrado de un pool en uso MUST
  mostrar el mensaje del servidor y dejar el pool en la lista.
- **FR-028**: Ante un rechazo del guardado de taxonomía que identifique una pregunta, el sistema MUST resaltar esa pregunta y
  mostrar el mensaje del servidor, usando la pregunta que el servidor indica y no una búsqueda dentro del texto.
- **FR-029**: Si el rechazo no identifica una pregunta, o identifica una que no está en el formulario, el sistema MUST mostrar
  solo el mensaje, sin resaltar nada y sin fallar (FR-009 de `005` se mantiene).

**Verificación (US5) y pruebas**

- **FR-030**: El recorrido "dar de alta un organismo y completar la taxonomía en una sola sesión" MUST poder cumplirse partiendo
  de una persona dada de alta por un administrador **con provincia asignada**, sin que se le pida elegir provincia.
- **FR-031**: Las pruebas de extremo a extremo de `005` que crean usuarios por el alta pública por contraseña MUST migrarse al
  alta administrada y al canje, y las que verifican comportamiento cambiado (perfil, usuarios, pools, recorrido SC-002) MUST
  actualizarse a la nueva regla.

### Key Entities *(include if feature involves data)*

- **Acceso inicial**: el enlace de un solo uso y con vencimiento que un administrador entrega a una persona dada de alta; el
  cliente lo muestra una vez al administrador y lo lee una vez de la dirección al canjearlo. Definido por `007`.
- **Usuario dado de alta**: la persona autorizada a ingresar, con email, rol y provincia; ya existe. Esta feature agrega su
  alta y edición de rol/provincia desde la interfaz.
- **Sesión de usuario**: ya modelada en `005`; ahora su rol y su provincia pueden cambiar por acción de un administrador
  mientras está abierta, y el cliente debe reflejarlo sin re-login.
- **Rechazo del servidor con mensaje**: la respuesta de error con texto legible y, en taxonomía, la pregunta afectada como
  dato propio. Definido por `007`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un administrador puede dar de alta a una persona y tener el enlace de acceso copiado en menos de 2 minutos, sin
  ayuda externa.
- **SC-002 (redefinido — reemplaza al de `005`)**: Una persona dada de alta por un administrador **con provincia asignada**
  puede, en una sola sesión desde que abre su enlace, fijar su contraseña, dar de alta un organismo y completar la taxonomía
  aplicable, con **0 pasos de elección de provincia**, **0 recargas de página** y sin reingresar ningún dato ya dado.
- **SC-003**: El 100% de los intentos de canje con un acceso no válido (usado, vencido, reemplazado, inventado o ausente)
  muestran exactamente el mismo mensaje y dejan **0** sesiones y **0** contraseñas fijadas.
- **SC-004**: Después de canjear o cerrar el aviso, **0 apariciones** del acceso inicial en la dirección visible, en el
  historial del navegador o en el almacenamiento del navegador, y **0 ocurrencias** de la contraseña persistida por el cliente.
- **SC-005**: El 100% de los usuarios normales ven la provincia de solo lectura en el perfil; **0** guardados de perfil de un
  usuario normal incluyen la provincia; el mensaje de "sin provincia" indica pedirla a un administrador en el 100% de los casos.
- **SC-006**: Un administrador puede cambiar el rol o la provincia de un usuario en 3 interacciones o menos desde la lista, y
  el 100% de los rechazos del servidor (incluido "no puede quedarse sin administradores") se muestran con su mensaje y dejan
  la pantalla en el estado real.
- **SC-007**: Un cambio de rol o de provincia hecho por un administrador rige en la siguiente pantalla o acción del usuario
  afectado en el 100% de los casos, sin re-login.
- **SC-008**: El 100% de los borrados de un pool en uso muestran el mensaje del servidor y dejan el pool en la lista.
- **SC-009**: El 100% de los rechazos de taxonomía que identifican una pregunta la resaltan; el 100% de los que no la
  identifican se muestran sin resaltar nada y sin fallar.
- **SC-010**: El 100% de las pruebas de extremo a extremo de `005` que hoy no pueden crear usuarios pasan otra vez, y las que
  verificaban comportamiento cambiado (SC-002, perfil, usuarios, pools) verifican el comportamiento nuevo.

## Assumptions

- **Backend congelado**: `007` está mergeado y el backend no se modifica. El contrato consumido es
  `specs/007-identidad-autorizacion/contracts/api.md`. Cualquier brecha del servidor que aparezca se registra aparte.
- **Reemisión del acceso incluida**: el pedido menciona el alta, pero `007` ofrece también reemitir un acceso para quien lo
  perdió; sin exponerlo en la interfaz un enlace perdido no tendría solución desde la app, así que se incluye (FR-004) como
  parte del mismo flujo y no como funcionalidad aparte.
- **Dirección del enlace**: una dirección propia del cliente con el acceso en el fragmento (recomendación registrada en
  `007`, Decisión 3: `…/primer-acceso#token=…`); el plan fija el nombre exacto. Es una pantalla pública por diseño y no se
  enlaza desde el login.
- **Política de contraseña**: la vigente (mínimo 8, máximo 128); no se endurece. El cliente la valida antes de enviar, pero
  el servidor sigue siendo quien decide.
- **Un acceso nuevo invalida el anterior**; el vencimiento por defecto es de 24 horas (configuración del servidor). El
  cliente muestra el vencimiento que el servidor informa, sin calcularlo.
- **Compartir a mano**: el administrador copia el enlace y lo entrega por su cuenta (Fase C traerá el envío por correo). Se
  acepta que el administrador conoce el enlace durante la entrega (canal de confianza, `007`).
- **Confirmación al quitar el rol de administrador**: se agrega por ser la operación de mayor consecuencia (revocación); no
  se pide confirmación para otorgarlo ni para cambiar la provincia.
- **Sesión existente al canjear**: se avisa y se reemplaza (FR-014), en lugar de bloquear el canje o entrar en silencio; es
  el comportamiento menos sorprendente para un admin que prueba el enlace en su propio navegador.
- **Provincia irrevocable**: el servidor no permite dejar a un usuario existente sin provincia; la interfaz no lo ofrece.
- **Administrador sin provincia**: sigue pudiendo elegirla en el alta de organismo (regla de `005`, sin cambios).
- **Alcance de FR-027**: cubre los mensajes de rechazo de pools; el resto de las pantallas ya muestran el mensaje del servidor
  y no cambian. Otros rechazos nuevos de `007` (localidad inexistente, tipo inexistente, etc.) se muestran con el mismo
  mecanismo existente de `005` sin trabajo adicional específico.
- **Cambios en pruebas existentes** (no es alcance nuevo, es consecuencia): las pruebas de extremo a extremo y las de
  contrato con respuestas reales de `005` se actualizan a los comportamientos y a las respuestas nuevas (FR-031); las
  respuestas reales grabadas para los endpoints nuevos se toman del backend real, no se inventan.
- **Fuera de esta feature**: T030 (Google de punta a punta, Fase E), envío real de correo (Fase C), rate limiting (Fase E),
  reporting (Fase D).
