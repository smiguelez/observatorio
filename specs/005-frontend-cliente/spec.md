# Feature Specification: Frontend del Observatorio — cliente que reemplaza la SPA actual

**Feature Branch**: `005-frontend-cliente`

**Created**: 2026-09-23

**Status**: Draft

**Input**: User description: "Especificá el frontend del observatorio — el cliente que consume el backend ya construido (002-backend-api-carga-datos, 003-taxonomia-parametrizable, 004-fix-taxonomia-endpoint), reemplazando la SPA actual (React/Firebase, src/) sin reutilizar su código. Stack: Vite + React + TypeScript + Tailwind CSS + shadcn/ui. No es una traducción 1:1 de la app actual — incluye tres ajustes deliberados: login con los tres métodos ya construidos; taxonomía como formulario dinámico a partir de GET /api/organismos/:orgId/taxonomia; jerarquía de menús diseñada por criterio de UX, con perfil de usuario y ajustes. Pantallas de usuario_normal: lista de organismos, alta de organismo (datos + fuero + provincia solo lectura), CRUD de UF (incluida asignación de jueces por pool/exclusivo/subconjunto de D8), formulario dinámico de taxonomía, tableros DataStudio (link externo), perfil propio, ajustes. Pantallas de admin: todo lo anterior, más gestión de organismos (checklist de completitud, exportar a PDF), asignación de editores por organismo, gestión de usuarios. Fuera de alcance: ítems del backlog de expectativas-nueva-app.md."

## Contexto

`002-backend-api-carga-datos`, `003-taxonomia-parametrizable` y
`004-fix-taxonomia-endpoint` construyeron un backend con autorización
server-side (Principio II) sobre el modelo relacional migrado. Hoy el
único cliente es la SPA original (`src/`, React + Firebase), que habla
directo con Firestore — la reformulación completa exige un cliente nuevo
que hable con este backend. Esta feature especifica ese cliente,
reemplazando la app actual sin portar su código (Principio XI: la app
actual es fuente de requisitos funcionales, no base a traducir línea por
línea).

**Hallazgo relevante para el alcance (verificado contra el backend real
antes de escribir este documento, no asumido — Principio VII)**: varias de
las pantallas pedidas necesitan datos que el backend actual **no expone
por ningún endpoint todavía**:

- **Catálogos de referencia** (`provincias`, `denominaciones_simplificadas`,
  `tipos_oficina`, `tipos_uf`, `fueros`): existen como tablas con FK real
  desde `organismos`/`unidades_funcionales`, pero ninguna tiene una ruta
  `GET`. Sin esto, ningún formulario de alta/edición puede mostrar un
  combo con las opciones válidas — ni "alta de organismo" ni "alta de UF"
  son construibles hoy tal como están pedidas.
- **Fuero de un organismo** (`organismo_fueros`, y la vista calculada
  `vista_fuero_simplificado` de `001-modelo-datos-relacional`): sin
  exposición por API. La pantalla de alta de organismo pide mostrar el
  fuero (solo lectura) — hoy no hay de dónde leerlo.
- **Asignación de jueces por UF** (`unidad_funcional_grupo_jueces`, el
  modelo confirmado en D8 —
  `docs/decisiones-pendientes.md`): la tabla existe, con
  `cantidad_asignada` por par (UF, pool), pero no tiene ningún endpoint,
  ni de lectura ni de escritura. Es exactamente la funcionalidad que esta
  spec pide para el CRUD de UF ("asignación de jueces por
  pool/exclusivo/subconjunto de D8") — hoy no es implementable contra el
  backend tal cual existe.
- **Editores de un organismo** (`organismo_editores`): se lee
  internamente para resolver autorización (`GET /api/organismos`), pero no
  hay ningún endpoint para gestionarlo (verlo explícitamente, agregar o
  quitar un editor) — necesario para la pantalla de admin "asignación de
  editores por organismo".
- **Catálogo completo de preguntas de taxonomía**: el pedido de esta spec
  describe el formulario dinámico como construido "a partir de lo que
  devuelve `GET /api/organismos/:orgId/taxonomia`" — pero ese endpoint,
  por diseño explícito de `004-fix-taxonomia-endpoint` (su spec.md,
  Assumptions: *"'Devolver todas las respuestas del organismo' significa
  las respuestas que existen hoy... no una lista de todas las preguntas
  del catálogo con huecos para las no respondidas"*), devuelve **solo las
  preguntas ya respondidas**, agrupadas — no la lista completa de
  preguntas aplicables al tipo del organismo. Un formulario que además
  deje *completar* preguntas sin responder todavía (no solo ver/editar las
  ya respondidas) necesita conocer el catálogo completo de
  `taxonomia_preguntas` (con su `tipo_respuesta` y las `taxonomia_opciones`
  de cada una) filtrado por tipo de organismo — dato que hoy tampoco tiene
  ningún endpoint propio.

Ninguno de estos gaps es una decisión de esta feature — son ausencias
reales y verificadas del backend ya construido. Ver **Assumptions** para
cómo se resuelve esto en el alcance de esta spec (no se expande el alcance
de "frontend" para incluir construir estos endpoints; se documentan como
dependencia explícita).

**Fuera de alcance explícito** (`docs/expectativas-nueva-app.md`; la
correspondencia exacta de ítems se corrigió acá porque la numeración
citada originalmente no coincidía con el contenido real del documento —
ver Assumptions):
- Rol nuevo `supervisor_provincial` (ítem 2) — requiere una regla de
  autorización nueva en el backend, no solo una pantalla.
- Ampliar taxonomía a tipos de organismo sin preguntas hoy (ítem 3).
- Log de auditoría de altas/bajas/modificaciones (ítem 4) — requiere una
  tabla nueva que no existe.
- Campos nuevos de plantilla/personal (ítem 5) — requiere columnas/tablas
  nuevas en el modelo ya migrado.
- Administración de taxonomía desde la UI, que un admin cree/edite
  preguntas y opciones (ítem 6) — feature aparte, con sus propias reglas
  de integridad a resolver antes.
- Ampliar tipos de unidad funcional más allá del catálogo actual (ítem 8).
- Link a normativa de creación (ítem 9).
- Digesto — motor de IA sobre documentación de organismos (ítem 10).
- Cualquier lógica de reporting/BI — los tableros de DataStudio se
  integran como link externo, esta feature no construye ni modifica
  ningún dashboard.
- Cualquier cambio al backend (`002`/`003`/`004`) o al modelo de datos —
  incluidos los gaps documentados arriba, que son dependencia, no alcance,
  de esta feature.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Iniciar sesión con cualquiera de los tres métodos disponibles (Priority: P1)

Como usuario del Observatorio, quiero poder iniciar sesión con
contraseña, con mi cuenta de Google, o con un enlace de acceso enviado a
mi email (magic link) — no solo con Google como en la app actual — para
poder entrar sin depender de un único proveedor externo.

**Why this priority**: sin poder autenticarse, ninguna otra pantalla es
alcanzable. Es además uno de los tres ajustes deliberados pedidos
explícitamente, no una traducción de lo que ya existe.

**Independent Test**: completar un inicio de sesión exitoso por cada uno
de los tres métodos por separado, y confirmar que las tres formas de
entrar llevan al mismo usuario a la misma sesión autenticada.

**Acceptance Scenarios**:

1. **Given** un usuario con contraseña ya creada, **When** ingresa email y
   contraseña correctos, **Then** queda autenticado y ve la pantalla
   principal de la app.
2. **Given** un usuario con cuenta de Google vinculada, **When** elige
   iniciar sesión con Google, **Then** completa el flujo externo y queda
   autenticado.
3. **Given** un usuario que pide un magic link a su email, **When** hace
   clic en el enlace recibido, **Then** queda autenticado sin haber
   ingresado ninguna contraseña.
4. **Given** un usuario que ya iba a entrar con contraseña, pero verificó
   antes su email por magic link, **When** intenta loguearse con la
   contraseña que tenía, **Then** ve un mensaje que explica que su
   contraseña fue invalidada por seguridad al verificar el email por otro
   método, con una forma clara de fijar una contraseña nueva (backlog,
   ítem 1 — resuelto acá, no es funcionalidad nueva sino la consecuencia
   de un comportamiento de seguridad ya construido en el backend).

---

### User Story 2 - Ver la lista de organismos accesibles y dar de alta uno nuevo (Priority: P1)

Como usuario, quiero ver los organismos a los que tengo acceso (los míos y
los que edito) y poder cargar uno nuevo con sus datos básicos, para
empezar a usar la app con datos reales.

**Why this priority**: es la pantalla de entrada al resto de la
funcionalidad (UF, taxonomía) — sin un organismo cargado no hay nada más
que hacer.

**Independent Test**: iniciar sesión, ver la lista de organismos propios,
completar el alta de uno nuevo, y verificar que aparece en la lista
inmediatamente después.

**Acceptance Scenarios**:

1. **Given** un usuario autenticado con organismos propios o de los que es
   editor, **When** entra a la lista de organismos, **Then** ve
   exactamente esos organismos, no otros.
2. **Given** un usuario en la pantalla de alta de organismo, **When**
   completa denominación, denominación simplificada, tipo de oficina y
   provincia y confirma, **Then** el organismo queda creado con él como
   propietario (el servidor lo fuerza así, sin importar qué mande el
   formulario — FR-013 de `002`).
3. **Given** un organismo recién creado, **When** el usuario lo abre,
   **Then** ve su fuero mostrado en modo solo lectura (no hay forma de
   editarlo desde acá).

---

### User Story 3 - Completar la taxonomía de un organismo con un formulario que se arma según lo que aplica (Priority: P1)

Como usuario, quiero responder la taxonomía de un organismo con un
formulario que muestre las preguntas correctas para ese organismo, cada
una con el control que corresponde a su tipo de respuesta (opción única,
opción múltiple, numérica, texto libre) — no una pantalla fija de 9 campos
como la actual.

**Why this priority**: es explícitamente uno de los tres ajustes
deliberados pedidos, y es consecuencia obligada del backend ya
parametrizado (`003`) — no tiene sentido seguir mostrando un formulario
fijo cuando el modelo de datos ya no lo es.

**Independent Test**: abrir la taxonomía de un organismo con preguntas ya
respondidas y confirmar que el formulario muestra cada una con el control
correcto para su tipo; completar una pregunta sin responder todavía y
confirmar que la respuesta se guarda.

**Acceptance Scenarios**:

1. **Given** un organismo con preguntas ya respondidas, **When** el
   usuario abre su taxonomía, **Then** ve cada pregunta con el texto real
   de la pregunta (no un código interno) y el control adecuado a su tipo,
   precargado con la respuesta existente.
2. **Given** una pregunta de tipo opción única, **When** el usuario elige
   otra opción y guarda, **Then** la respuesta se actualiza.
3. **Given** una pregunta de tipo opción múltiple, **When** el usuario
   marca más de una opción, **Then** todas quedan guardadas como
   respuesta de esa pregunta.
4. **Given** un conjunto de respuestas que el usuario intenta guardar
   viola una regla de integridad del backend, **When** confirma el
   formulario, **Then** ve un mensaje de error claro identificando qué
   pregunta tiene el problema — no un error genérico.

---

### User Story 4 - Gestionar las unidades funcionales de un organismo, incluida la asignación de jueces (Priority: P2)

Como usuario, quiero dar de alta, editar y eliminar las unidades
funcionales de mis organismos, y asignarles la cantidad de jueces a la que
asisten — ya sea un grupo exclusivo, un pool compartido completo, o un
subconjunto de un pool — para que la carga de UF refleje cómo funciona en
la práctica (D8).

**Why this priority**: es funcionalidad central del relevamiento, pero
depende de que la lista de organismos (US2) ya exista.

**Independent Test**: dar de alta una UF nueva, asignarle una cantidad de
jueces de un pool existente, y confirmar que la asignación aparece
correctamente reflejada, tanto por UF individual como en cualquier vista
agregada por pool.

**Acceptance Scenarios**:

1. **Given** un organismo con al menos una UF, **When** el usuario la
   edita, **Then** puede cambiar sus datos básicos (denominación,
   localidad, tipo, domicilio, etc.).
2. **Given** una UF sin ninguna asignación de jueces, **When** el usuario
   le asigna una cantidad de un pool ya existente en su provincia, **Then**
   la asignación queda guardada y visible en la UF.
3. **Given** una UF que ya asiste a un pool, **When** el usuario le agrega
   una asignación a un segundo pool distinto, **Then** ambas asignaciones
   coexisten (D8, caso 3/4 — una UF puede asistir a más de un pool).
4. **Given** un pool con 10 jueces, **When** el usuario asigna a una UF
   solo 3 de esos 10 (subconjunto, D8 caso 5), **Then** la asignación de 3
   queda guardada, sin que el sistema exija identificar cuáles jueces
   puntuales son.

---

### User Story 5 - Navegar la app mediante una jerarquía de menús pensada para el usuario (Priority: P2)

Como usuario, quiero una navegación clara y agrupada por criterio de uso
(no una lista plana de opciones), con acceso directo a mi perfil, a los
ajustes de la aplicación, y a los tableros externos, para no depender de
memorizar dónde está cada cosa.

**Why this priority**: es el tercer ajuste deliberado pedido
explícitamente — una jerarquía de menús diseñada por UX, no una copia de
la actual — y es lo que hace utilizables al resto de las pantallas.

**Independent Test**: desde cualquier pantalla, llegar al perfil propio,
a los ajustes, y a los tableros de DataStudio en tres pasos o menos cada
uno, sin necesidad de conocer de antemano dónde están.

**Acceptance Scenarios**:

1. **Given** un usuario autenticado, **When** abre el menú principal,
   **Then** ve las secciones agrupadas de forma consistente con lo que
   puede hacer según su rol (más opciones visibles para admin).
2. **Given** un usuario en cualquier pantalla, **When** busca su perfil o
   los ajustes, **Then** los encuentra en un menú de usuario dedicado, no
   mezclado con la navegación de organismos/UF.
3. **Given** un usuario que quiere ver los tableros de reporting, **When**
   hace clic en el acceso correspondiente, **Then** se abre el tablero de
   DataStudio (enlace externo) — esta app no reconstruye ningún reporte.

---

### User Story 6 - Editar los propios datos y gestionar los métodos de inicio de sesión desde el perfil (Priority: P2)

Como usuario, quiero poder editar mis propios datos, cambiar mi
contraseña, y ver/gestionar qué métodos de login tengo vinculados a mi
cuenta, desde una pantalla de perfil dedicada — que hoy no existe.

**Why this priority**: es parte del mismo ajuste deliberado de menús
(perfil de usuario) — sin esto, ese menú nuevo estaría vacío.

**Independent Test**: cambiar un dato propio (por ejemplo, la provincia) y
confirmar que se guarda; cambiar la contraseña y confirmar que el login
siguiente la usa.

**Acceptance Scenarios**:

1. **Given** un usuario en su pantalla de perfil, **When** edita un dato
   propio y guarda, **Then** el cambio se refleja de inmediato.
2. **Given** un usuario con contraseña, **When** la cambia desde el
   perfil, **Then** el próximo login exige la contraseña nueva.
3. **Given** un usuario con más de un método de login vinculado, **When**
   entra a la sección de métodos de acceso, **Then** ve cuáles tiene
   activos.

---

### User Story 7 - (admin) Revisar el estado de completitud de los organismos y exportarlo (Priority: P3)

Como administrador, quiero ver de un vistazo qué tan completa está la
carga de cada organismo (datos básicos, UF, taxonomía) y poder exportar
ese estado, para priorizar el seguimiento con los referentes provinciales.

**Why this priority**: es valioso para la gestión, pero no bloquea que el
resto de la app funcione — depende de que exista suficiente contenido
cargado (US2-US4) para tener algo que evaluar.

**Independent Test**: abrir la vista de gestión de organismos como admin,
confirmar que un organismo con todo cargado se distingue claramente de uno
incompleto, y exportar esa vista a un PDF legible.

**Acceptance Scenarios**:

1. **Given** un admin en la vista de gestión de organismos, **When** la
   abre, **Then** ve, por organismo, qué partes están completas (datos
   básicos, al menos una UF, taxonomía respondida) y cuáles no.
2. **Given** esa misma vista, **When** el admin exporta, **Then** obtiene
   un archivo PDF con la misma información mostrada en pantalla.

---

### User Story 8 - (admin) Asignar editores a un organismo (Priority: P3)

Como administrador, quiero poder agregar o quitar editores de un
organismo, para poder resolver casos donde el propietario necesita ayuda
de otro usuario sin transferirle la propiedad.

**Why this priority**: es una operación de gestión puntual, no bloquea el
uso diario de la app.

**Independent Test**: agregar un usuario como editor de un organismo ajeno
y confirmar que ese usuario ahora puede ver y editar ese organismo;
quitarlo y confirmar que pierde el acceso.

**Acceptance Scenarios**:

1. **Given** un admin en la pantalla de un organismo, **When** agrega a un
   usuario como editor, **Then** ese usuario pasa a ver el organismo en su
   propia lista (US2).
2. **Given** un editor ya asignado, **When** el admin lo quita, **Then**
   ese usuario deja de tener acceso al organismo.

---

### User Story 9 - (admin) Gestionar usuarios (Priority: P3)

Como administrador, quiero ver la lista de usuarios del sistema y poder
cambiar su rol, para administrar quién tiene permisos de admin.

**Why this priority**: operación de administración de más baja frecuencia
que el resto.

**Independent Test**: como admin, cambiar el rol de un usuario y confirmar
que el cambio se refleja en lo que ese usuario puede hacer.

**Acceptance Scenarios**:

1. **Given** un admin en la gestión de usuarios, **When** ve la lista,
   **Then** puede ver el perfil completo de cualquier usuario (email, rol,
   provincia).
2. **Given** un usuario sin rol admin, **When** el admin le otorga el rol,
   **Then** ese usuario pasa a tener acceso de administrador la próxima
   vez que use la app.

---

### Edge Cases

- Un usuario sin sesión válida intenta acceder a cualquier pantalla que no
  sea login: se lo redirige a iniciar sesión, sin exponer ningún dato.
- Un usuario intenta abrir un organismo, UF, o taxonomía que no le
  pertenece y del que no es editor ni admin: ve un mensaje de acceso
  denegado, no un error genérico ni una pantalla vacía engañosa.
- La sesión expira mientras el usuario está completando un formulario: al
  intentar guardar, se le avisa que su sesión venció y se lo lleva a
  loguearse de nuevo, sin perder silenciosamente lo que había escrito si
  es evitable.
- Un formulario de taxonomía incluye una pregunta de opción múltiple sin
  ninguna opción marcada: equivale a no responder esa pregunta, no es un
  error de validación.
- Dos pestañas del mismo usuario editan el mismo organismo al mismo
  tiempo: la última escritura exitosa gana (mismo comportamiento que ya
  garantiza el backend — reemplazo completo en taxonomía, `UPDATE` directo
  en organismo/UF) — esta feature no agrega ningún mecanismo de bloqueo
  optimista nuevo.
- Un usuario_normal intenta acceder por URL directa a una pantalla de
  admin (gestión de usuarios, asignación de editores): se le deniega,
  igual que si no existiera el enlace.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema MUST permitir iniciar sesión por contraseña, por
  Google, y por magic link, usando los tres métodos ya construidos en el
  backend — ninguno MUST ser un prerequisito para poder usar los otros
  dos.
- **FR-002**: El sistema MUST mostrar un mensaje explicativo, no un error
  genérico, cuando un intento de login por contraseña falla porque esa
  credencial fue invalidada automáticamente por el backend al verificarse
  el email por otro método.
- **FR-003**: El sistema MUST mostrar, a cualquier usuario autenticado,
  únicamente los organismos de los que es propietario o editor — todos,
  sin excepción, si el usuario es admin.
- **FR-004**: El sistema MUST permitir dar de alta un organismo con sus
  datos básicos (denominación, denominación simplificada, tipo de
  oficina, provincia), sin exponer nunca un campo editable de
  "propietario" — el backend ya lo fuerza al usuario que crea, el
  formulario MUST NOT sugerir que es un dato que se puede elegir.
- **FR-005**: El sistema MUST mostrar el fuero de un organismo en modo
  exclusivamente de lectura — ninguna pantalla MUST ofrecer una forma de
  editarlo.
- **FR-006**: El sistema MUST construir el formulario de taxonomía de un
  organismo dinámicamente, a partir de las preguntas aplicables a ese
  organismo y sus tipos de respuesta — nunca un conjunto fijo de campos
  codificado de antemano.
- **FR-007**: El sistema MUST mostrar, para cada pregunta de taxonomía, el
  control de entrada correspondiente a su tipo de respuesta (opción única:
  selección simple; opción múltiple: selección de varias; numérica: campo
  numérico; texto libre: campo de texto).
- **FR-008**: El sistema MUST mostrar el texto real de cada pregunta de
  taxonomía, no su código interno.
- **FR-009**: El sistema MUST identificar, ante un rechazo del backend al
  guardar taxonomía, qué pregunta concreta tuvo el problema — no un
  mensaje de error genérico.
- **FR-010**: El sistema MUST permitir dar de alta, editar, y eliminar
  unidades funcionales de un organismo propio o de uno del que el usuario
  es editor.
- **FR-011**: El sistema MUST permitir asignar a una unidad funcional una
  cantidad de jueces de uno o más pools existentes en su provincia,
  incluido el caso de un subconjunto de un pool (D8) — sin exigir
  identificar individualmente qué jueces integran ese subconjunto.
- **FR-012**: El sistema MUST permitir que una misma unidad funcional
  tenga asignaciones a más de un pool a la vez (D8, casos 3 y 4).
- **FR-013**: El sistema MUST proveer una navegación agrupada por
  secciones de uso, distinta de una lista plana de enlaces, con al menos
  un menú de perfil de usuario y un menú de ajustes de la aplicación —
  ninguno de los dos existente en la app actual.
- **FR-014**: El sistema MUST permitir al usuario editar sus propios
  datos, cambiar su contraseña, y ver qué métodos de login tiene
  vinculados, desde su perfil.
- **FR-015**: El sistema MUST proveer un acceso directo a los tableros de
  reporting de DataStudio como enlace externo — esta app MUST NOT
  reconstruir ningún reporte ni dashboard propio.
- **FR-016**: El sistema MUST restringir el acceso a las pantallas de
  administración (gestión de organismos, asignación de editores, gestión
  de usuarios) a usuarios con rol admin — un usuario sin ese rol que
  acceda por URL directa MUST ver la misma denegación que si la pantalla
  no existiera.
- **FR-017**: El sistema MUST mostrar, en la vista de gestión de
  organismos (admin), el estado de completitud de cada organismo (datos
  básicos, unidades funcionales, taxonomía), y MUST permitir exportar esa
  vista a un archivo descargable.
- **FR-018**: El sistema MUST permitir a un admin agregar y quitar
  editores de cualquier organismo.
- **FR-019**: El sistema MUST permitir a un admin ver la lista completa de
  usuarios y cambiar el rol de cualquiera de ellos.
- **FR-020**: El sistema MUST redirigir a la pantalla de login a
  cualquier usuario sin sesión válida que intente acceder a cualquier otra
  pantalla, sin exponer datos antes de esa redirección.
- **FR-021**: El sistema MUST denegar el acceso, con un mensaje claro de
  "no autorizado", a un usuario que intenta ver o editar un organismo,
  unidad funcional, o taxonomía que no le pertenece y del que no es
  editor ni admin — nunca una pantalla vacía o degradada en silencio.

### Key Entities *(include if feature involves data)*

- **Sesión de usuario**: el estado de autenticación del cliente — a qué
  usuario corresponde y con qué método se inició; ya modelado por el
  backend (`Better Auth`), este cliente solo lo consume.
- **Organismo, Unidad Funcional, Taxonomía**: entidades ya definidas por
  `001`/`003`/`004` — esta feature no agrega ninguna, solo las presenta y
  permite editarlas dentro de lo que el backend ya expone.
- **Catálogos de referencia** (provincias, tipos de oficina, tipos de UF,
  denominaciones simplificadas, fueros, pools de jueces): datos de
  selección para los formularios — ya existen como tablas, su exposición
  por API es una dependencia de esta feature, no algo que ella modele
  (ver Contexto y Assumptions).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un usuario puede completar el inicio de sesión por
  cualquiera de los tres métodos en menos de 1 minuto, sin ayuda externa.
- **SC-002**: Un usuario nuevo puede dar de alta un organismo y completar
  la taxonomía aplicable en una sola sesión de uso, sin necesitar volver a
  preguntar cómo hacerlo una segunda vez.
- **SC-003**: El 100% de las preguntas de taxonomía se muestran con el
  control correcto para su tipo de respuesta, verificado contra los 4
  tipos existentes (opción única, opción múltiple, numérica, texto
  libre).
- **SC-004**: El 100% de los intentos de acceso a datos ajenos (organismo,
  UF, taxonomía, o pantalla de admin) sin el permiso correspondiente se
  deniegan — 0% de exposición accidental de datos o funciones fuera del
  rol del usuario.
- **SC-005**: Un usuario puede llegar a su perfil, a los ajustes, y a los
  tableros externos desde cualquier pantalla en 3 clics o menos.
- **SC-006**: Un admin puede identificar, sin abrir cada organismo uno por
  uno, cuáles están completos y cuáles no, desde una sola vista.
- **SC-007**: 0% de las pantallas de la app nueva son una copia visual
  directa de una pantalla de la app actual — verificado contra los tres
  ajustes deliberados (login de 3 métodos, taxonomía dinámica, menús por
  UX) más las dos pantallas explícitamente nuevas (perfil, ajustes).

## Assumptions

- **Dependencia de backend no resuelta por esta feature**: los catálogos
  de referencia (`provincias`, `denominaciones_simplificadas`,
  `tipos_oficina`, `tipos_uf`, `fueros`), la asignación UF↔jueces
  (`unidad_funcional_grupo_jueces`, D8), la gestión de editores
  (`organismo_editores`), y el catálogo completo de preguntas de
  taxonomía (no solo las respondidas) no tienen ningún endpoint hoy —
  verificado contra el código real de `002`/`003`/`004`, no asumido. Esta
  feature de frontend asume que esos endpoints van a existir para cuando
  se implemente (por una feature de backend previa o paralela, mismo
  patrón que dio origen a `004`) — no expande su propio alcance para
  construirlos, porque el pedido original la enmarca explícitamente como
  "el cliente que consume el backend ya construido".
- **Corrección de la cita de `docs/expectativas-nueva-app.md`**: el pedido
  original citó "ítems 1, 3, 5, 6, 8, 9, 10 fuera de alcance — no 2, 4, 7"
  pero la enumeración en prosa que lo acompañaba (rol
  `supervisor_provincial`, log de auditoría, etc.) corresponde en
  realidad a los ítems **2, 3, 4, 6, 8, 9, 10** del documento real, más el
  ítem **5** (campos de plantilla/personal, que requiere columnas nuevas
  no construidas — objetivamente fuera de alcance sin importar la
  numeración exacta citada). El ítem **7** (perfil, ajustes, jerarquía de
  menús) está explícitamente **dentro** del alcance de esta feature — es
  uno de los tres ajustes deliberados pedidos, consistente con la prosa
  original. El ítem **1** (aviso de revocación de contraseña) también
  queda dentro de esta feature (User Story 1, Acceptance Scenario 4) — el
  propio backlog lo asigna explícitamente "a resolver en la feature de
  frontend".
- Los tableros de DataStudio ya existen y tienen una URL estable — esta
  feature solo necesita el enlace, no valida su contenido.
- El "checklist de completitud" (US7) se basa en datos ya visibles por la
  app (organismo con datos básicos, al menos 1 UF cargada, taxonomía con
  al menos una respuesta) — no en un criterio de negocio adicional no
  especificado; si el criterio real es otro, es un ajuste de contenido
  liviano sobre esta base, no un cambio de alcance.
- La exportación a PDF (US7) se genera en el cliente, a partir de los
  mismos datos que ya se muestran en pantalla — no requiere un servicio de
  generación de documentos en el backend.
- El menú de "ajustes de la aplicación" (FR-013) puede no tener, en esta
  primera versión, más contenido concreto que un lugar reservado en la
  navegación — el backlog no especifica qué configuración concreta va
  ahí; se construye el punto de entrada, su contenido crece después según
  necesidad real.
- "Última escritura gana" (sin bloqueo optimista) es el comportamiento
  esperado ante ediciones concurrentes — mismo criterio que ya tiene el
  backend (ningún endpoint de `002`/`003`/`004` implementa versionado
  optimista), esta feature no introduce uno nuevo solo del lado del
  cliente.
