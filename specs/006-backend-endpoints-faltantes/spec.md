# Feature Specification: Endpoints de backend que el frontend necesita y hoy no existen

**Feature Branch**: `006-backend-endpoints-faltantes`

**Created**: 2026-09-23

**Status**: Draft

**Input**: User description: "Especificá los endpoints de backend que 005-frontend-cliente necesita y que hoy no existen (hallazgo verificado contra el código real en el spec de esa feature): 1. Catálogos de referencia de solo lectura: provincias, denominaciones simplificadas, tipos de oficina, tipos de UF, fueros. 2. Fuero de un organismo: exponer organismo_fueros y fuero_simplificado (D3). 3. Asignación de jueces por UF (unidad_funcional_grupo_jueces, D8): lectura y escritura, respetando las reglas ya existentes en el esquema. 4. Editores de organismo (organismo_editores): lectura y escritura. 5. Catálogo completo de preguntas de taxonomía (taxonomia_preguntas + taxonomia_opciones + taxonomia_pregunta_tipos_oficina), filtrable por tipo de organismo — distinto del endpoint de respuestas ya existente (004). Autorización: catálogos y preguntas de taxonomía de lectura para cualquier autenticado (mismo criterio que localidades, 002); fuero/editores/asignaciones de jueces según la regla ya vigente de organismo (esOwnerOEditor()/esAdmin()). Fuera de alcance: cualquier cambio al esquema de datos, y cualquier pantalla de frontend (eso es 005, que queda bloqueada hasta que esto se resuelva)."

## Contexto

`005-frontend-cliente` especificó el cliente que reemplaza la SPA actual,
y en el proceso verificó contra el código real de
`002-backend-api-carga-datos`, `003-taxonomia-parametrizable` y
`004-fix-taxonomia-endpoint` que varios datos que ese frontend necesita no
tienen ningún endpoint — no es una carencia menor: bloquea directamente 4
de las 9 historias de usuario de esa feature (alta de organismo, gestión
de UF, taxonomía dinámica, asignación de editores). Esta feature cierra
esa brecha, exclusivamente del lado del backend — ninguna pantalla, ningún
cambio de esquema. Todas las tablas que se exponen acá ya existen, con su
integridad referencial ya declarada por `001-modelo-datos-relacional` (y,
para `asignacion_fueros`, ya con su propio trigger de integridad — ver
Edge Cases).

**Verificado antes de escribir este documento** (Principio VII): las 5
tablas/vistas en cuestión existen en `public.*`, con la forma exacta que
usa este spec (columnas, FKs, constraints) — confirmado por inspección
directa del esquema real, no por lo que el código de otra feature asume.

**Fuera de alcance explícito**:
- Cualquier cambio al modelo de datos — las 5 tablas/vista ya existen tal
  cual se necesitan; esta feature solo las expone.
- Cualquier pantalla o componente de frontend — `005-frontend-cliente`
  sigue siendo la que los consume; queda bloqueada hasta que esta feature
  cierre.
- `asignacion_fueros` (fuero específico de una asignación UF↔pool
  puntual, D8): es una tabla relacionada pero de otro grano que
  `organismo_fueros` (fuero del organismo completo, que sí se expone acá,
  ítem 2) — no fue pedida explícitamente y no tiene ningún consumidor
  identificado todavía en `005`. Ver Edge Cases para el efecto colateral
  que si tiene sobre el endpoint de asignaciones (ítem 3).
- Cualquier regla de autorización nueva — los 5 grupos de endpoints
  reutilizan reglas ya existentes (lectura abierta a cualquier
  autenticado, o la regla ya vigente de organismo), ninguna se inventa
  para esta feature.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Leer los catálogos de referencia para poblar formularios (Priority: P1)

Como cliente de la API (el frontend), quiero poder leer la lista completa
de provincias, denominaciones simplificadas, tipos de oficina, tipos de
UF, y fueros, para poder mostrar las opciones válidas en cualquier
formulario de alta o edición que dependa de ellas.

**Why this priority**: sin esto, ningún formulario de alta de organismo ni
de UF es construible — es la dependencia más transversal de las 5.

**Independent Test**: pedir cada uno de los 5 catálogos con una sesión
autenticada cualquiera (sin rol especial) y confirmar que devuelve la
lista completa y real de esa tabla.

**Acceptance Scenarios**:

1. **Given** un usuario autenticado sin ninguna relación con ningún
   organismo, **When** pide cualquiera de los 5 catálogos, **Then**
   recibe la lista completa — esta lectura no depende de ser
   propietario, editor, ni admin de nada.
2. **Given** un pedido sin sesión válida, **When** intenta leer cualquiera
   de los 5 catálogos, **Then** se rechaza igual que cualquier otra ruta
   de la API (FR-004 de `002`).

---

### User Story 2 - Consultar el fuero de un organismo (Priority: P1)

Como cliente de la API, quiero poder leer el fuero (o los fueros) de un
organismo, incluida la versión simplificada ya calculada (D3), para
mostrarlo en modo de solo lectura.

**Why this priority**: bloquea directamente la pantalla de alta/detalle de
organismo de `005`.

**Independent Test**: pedir el fuero de un organismo real con fueros
cargados y confirmar que la respuesta incluye tanto el detalle
(`organismo_fueros`) como el valor ya simplificado
(`vista_fuero_simplificado`).

**Acceptance Scenarios**:

1. **Given** un organismo con uno o más fueros asignados, **When** un
   usuario autorizado sobre ese organismo pide su fuero, **Then** recibe
   el o los fueros concretos y el valor simplificado calculado.
2. **Given** un organismo sin ningún fuero asignado todavía, **When** se
   pide su fuero, **Then** la respuesta lo refleja sin error (lista vacía
   de fueros concretos, simplificado nulo o equivalente) — no es un caso
   de error.
3. **Given** un usuario sin relación con el organismo, **When** pide su
   fuero, **Then** se rechaza con la misma regla que ya rechaza el resto
   de los datos de ese organismo (FR-012 de `002`).

---

### User Story 3 - Gestionar la asignación de jueces de una unidad funcional (Priority: P1)

Como cliente de la API, quiero poder leer y escribir las asignaciones de
jueces de una UF a uno o más pools (D8: exclusivo, pool completo, o
subconjunto, cada uno con su cantidad), para que el frontend pueda ofrecer
esa carga.

**Why this priority**: es la funcionalidad central de gestión de UF que
bloquea `005`, y la más nueva en términos de reglas de integridad a
respetar.

**Independent Test**: crear una asignación de una UF a un pool con una
cantidad dentro de lo válido, leerla de vuelta, editarla, y eliminarla —
confirmando en cada paso que el estado coincide con lo esperado.

**Acceptance Scenarios**:

1. **Given** una UF sin ninguna asignación, **When** se le crea una
   asignación a un pool existente con una cantidad mayor a 0, **Then**
   la asignación queda creada y es recuperable por lectura.
2. **Given** una UF con una asignación a un pool, **When** se le crea una
   segunda asignación a un pool *distinto*, **Then** ambas coexisten (D8,
   una UF puede asistir a más de un pool a la vez).
3. **Given** una UF con una asignación existente a un pool, **When** se
   intenta crear una segunda asignación a ese *mismo* pool, **Then** se
   rechaza (ya existe esa combinación — el esquema la declara única).
4. **Given** una asignación con cantidad 0 o negativa, **When** se intenta
   crear o editar con ese valor, **Then** se rechaza (el esquema exige
   cantidad mayor a 0).
5. **Given** una asignación existente, **When** se elimina, **Then** deja
   de aparecer en la lectura de asignaciones de esa UF.

---

### User Story 4 - Gestionar los editores de un organismo (Priority: P2)

Como cliente de la API, quiero poder ver, agregar, y quitar editores de un
organismo, para que la pantalla de administración pueda ofrecer esa
gestión.

**Why this priority**: bloquea una pantalla de `005`, pero de uso menos
frecuente que las tres anteriores.

**Independent Test**: agregar un usuario como editor de un organismo,
confirmar que aparece en la lista de editores y que ese usuario ahora
puede ver el organismo, y quitarlo.

**Acceptance Scenarios**:

1. **Given** un organismo sin editores, **When** su propietario o un admin
   agrega un usuario como editor, **Then** ese usuario aparece en la
   lista de editores del organismo.
2. **Given** un organismo con un editor ya asignado, **When** se lo
   quita, **Then** deja de aparecer en la lista — y, consistente con la
   autorización ya vigente, ese usuario deja de poder ver el organismo.
3. **Given** un usuario que no es propietario ni admin del organismo,
   **When** intenta agregar o quitar un editor, **Then** se rechaza.

---

### User Story 5 - Leer el catálogo completo de preguntas de taxonomía (Priority: P1)

Como cliente de la API, quiero poder leer todas las preguntas de
taxonomía que aplican a un tipo de organismo dado, con su tipo de
respuesta y sus opciones — no solo las que un organismo puntual ya
respondió — para que el frontend pueda ofrecer un formulario que incluya
preguntas todavía sin responder.

**Why this priority**: bloquea directamente el formulario dinámico de
taxonomía de `005`, uno de sus tres ajustes deliberados — sin esto, esa
historia no es implementable tal como fue pedida.

**Independent Test**: pedir el catálogo de preguntas filtrado por un tipo
de organismo real, y confirmar que devuelve exactamente las preguntas
aplicables a ese tipo (`taxonomia_pregunta_tipos_oficina`), cada una con
su tipo de respuesta y, si corresponde, sus opciones.

**Acceptance Scenarios**:

1. **Given** un tipo de organismo con preguntas aplicables cargadas
   (`oficina judicial`), **When** se pide el catálogo filtrado por ese
   tipo, **Then** se reciben exactamente esas preguntas, cada una con
   código, texto, grupo, y tipo de respuesta.
2. **Given** una pregunta de tipo opción única o múltiple dentro de ese
   catálogo, **When** se la consulta, **Then** incluye también sus
   opciones válidas (código y etiqueta).
3. **Given** un tipo de organismo sin ninguna pregunta aplicable
   (`coordinación`, `unidad operativa`), **When** se pide el catálogo
   filtrado por ese tipo, **Then** se recibe una lista vacía, no un
   error.
4. **Given** un pedido del catálogo sin filtro de tipo, **When** se
   ejecuta, **Then** devuelve el catálogo completo de las 9 preguntas
   existentes — el filtro por tipo MUST ser opcional, no obligatorio.

---

### Edge Cases

- Crear una asignación UF↔pool con un `grupo_jueces_id` de una provincia
  distinta a la de la UF: el esquema no declara ninguna restricción que lo
  impida (verificado — no hay FK ni trigger que lo valide) — esta feature
  no agrega una nueva; si el caso real llega a producirse, es una decisión
  a tomar aparte, no algo que este spec deba resolver sin que se haya
  pedido.
- Eliminar una asignación UF↔pool que tiene fueros propios cargados en
  `asignacion_fueros` (tabla no expuesta por esta feature, ver Fuera de
  alcance): el esquema ya declara esa relación con `ON DELETE CASCADE` —
  eliminar la asignación elimina también esas filas de fuero-por-
  asignación automáticamente. Este endpoint no necesita lógica adicional
  para eso, pero el comportamiento existe y debe quedar documentado, no
  descubierto por accidente.
- Pedir el fuero de un `:orgId` inexistente: mismo criterio que el resto
  de las subrutas de organismo — rechazo de "no encontrado", no una
  respuesta vacía ambigua.
- Agregar como editor a un usuario que ya es el propietario del
  organismo: no tiene sentido de negocio (ya tiene acceso total) pero el
  esquema no lo impide (no hay constraint cruzada entre
  `organismos.propietario_id` y `organismo_editores`) — esta feature no
  agrega una validación nueva que nadie pidió; queda como una operación
  sin efecto práctico, no como un error.
- Pedir el catálogo de preguntas con un `tipoOficinaId` que no existe en
  `tipos_oficina`: se rechaza como pedido inválido, no como lista vacía
  (distinto del caso de un tipo real sin preguntas aplicables, que sí es
  una lista vacía válida).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema MUST exponer, por lectura, el catálogo completo
  de provincias, denominaciones simplificadas, tipos de oficina, tipos de
  UF, y fueros — cada uno accesible para cualquier usuario autenticado,
  sin restricción adicional de rol o relación con ningún organismo (mismo
  criterio que el catálogo de localidades ya existente).
- **FR-002**: El sistema MUST NOT exponer ninguna operación de escritura
  sobre los catálogos de FR-001 — son datos de referencia, mismo criterio
  que localidades.
- **FR-003**: El sistema MUST exponer, por lectura, el fuero de un
  organismo — tanto el detalle de fueros concretos asignados como el
  valor ya simplificado (`fuero_simplificado`, D3) — bajo la misma regla
  de autorización que ya rige el resto de los datos de ese organismo
  (propietario, editor, o admin).
- **FR-004**: El sistema MUST devolver una respuesta válida (no un error)
  al pedir el fuero de un organismo que todavía no tiene ningún fuero
  asignado.
- **FR-005**: El sistema MUST exponer, por lectura, las asignaciones de
  jueces (UF↔pool, con su cantidad) de una unidad funcional, bajo la
  misma regla de autorización que ya rige el resto de los datos de esa UF
  (heredada del organismo padre).
- **FR-006**: El sistema MUST permitir crear una asignación de jueces
  nueva para una UF, indicando el pool y la cantidad asignada, bajo la
  misma regla de autorización de FR-005.
- **FR-007**: El sistema MUST permitir que una misma UF tenga más de una
  asignación a pools distintos simultáneamente (D8).
- **FR-008**: El sistema MUST rechazar la creación de una segunda
  asignación para el mismo par (UF, pool) ya existente — el esquema ya lo
  garantiza como único, este endpoint MUST devolver un error identificable
  ante ese rechazo, no un error genérico.
- **FR-009**: El sistema MUST rechazar una asignación con cantidad menor
  o igual a cero, con un error identificable — el esquema ya lo garantiza,
  este endpoint traduce ese rechazo.
- **FR-010**: El sistema MUST permitir editar la cantidad asignada de una
  asignación existente.
- **FR-011**: El sistema MUST permitir eliminar una asignación existente.
- **FR-012**: El sistema MUST exponer, por lectura, la lista de editores
  actuales de un organismo, bajo la misma regla de autorización que ya
  rige el resto de los datos de ese organismo.
- **FR-013**: El sistema MUST permitir agregar un usuario como editor de
  un organismo, y quitarlo, restringido a quien ya puede gestionar ese
  organismo (propietario o admin) — un editor existente MUST NOT poder
  agregar o quitar a otros editores por sí mismo, salvo que también sea
  propietario o admin.
- **FR-014**: El sistema MUST exponer, por lectura, el catálogo completo
  de preguntas de taxonomía (código, texto, grupo, tipo de respuesta, y
  sus opciones cuando corresponda), accesible para cualquier usuario
  autenticado, sin restricción adicional — es configuración, no dato de
  un organismo puntual.
- **FR-015**: El sistema MUST permitir filtrar el catálogo de FR-014 por
  tipo de organismo, devolviendo únicamente las preguntas aplicables a
  ese tipo — y MUST devolver el catálogo completo cuando no se pida
  ningún filtro.
- **FR-016**: El sistema MUST devolver una lista vacía (no un error) al
  filtrar el catálogo de preguntas por un tipo de organismo real que no
  tiene ninguna pregunta aplicable todavía.
- **FR-017**: El sistema MUST rechazar, con un error identificable, un
  filtro de tipo de organismo que no corresponde a ningún tipo real —
  distinto del caso de FR-016 (tipo real sin preguntas, que es una lista
  vacía válida).

### Key Entities *(include if feature involves data)*

- Ninguna entidad de datos nueva — esta feature expone, sin modificar,
  las tablas ya existentes: `provincias`, `denominaciones_simplificadas`,
  `tipos_oficina`, `tipos_uf`, `fueros`, `organismo_fueros`,
  `vista_fuero_simplificado`, `unidad_funcional_grupo_jueces`,
  `organismo_editores`, `taxonomia_preguntas`, `taxonomia_opciones`,
  `taxonomia_pregunta_tipos_oficina`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El 100% de los 5 catálogos de referencia son legibles por
  cualquier usuario autenticado, verificado contra los datos reales de
  cada tabla.
- **SC-002**: El fuero de cualquier organismo real (con o sin fueros
  asignados) es legible por quien ya tiene acceso a ese organismo, sin
  ningún error.
- **SC-003**: Una UF puede tener 2 o más asignaciones de jueces a pools
  distintos simultáneamente, verificado creando ese caso real y
  leyéndolo de vuelta completo.
- **SC-004**: El 100% de los intentos de crear una asignación que viola
  una regla ya existente del esquema (par UF-pool duplicado, cantidad no
  positiva) se rechazan con un error identificable, nunca un error
  genérico de servidor.
- **SC-005**: Un admin (o el propietario) puede agregar y quitar un
  editor de un organismo, y ese cambio se refleja de inmediato en quién
  puede acceder a ese organismo.
- **SC-006**: El catálogo de preguntas de taxonomía filtrado por
  cualquiera de los tipos de organismo reales devuelve exactamente las
  preguntas aplicables a ese tipo, verificado contra los datos reales de
  `taxonomia_pregunta_tipos_oficina`.
- **SC-007**: `005-frontend-cliente` deja de estar bloqueada por
  ausencia de datos de backend — las 4 historias de usuario que
  dependían de estos endpoints (alta de organismo, gestión de UF,
  taxonomía dinámica, asignación de editores) tienen, después de esta
  feature, todo el dato que necesitan disponible por API.

## Assumptions

- Estos 5 grupos de endpoints se agregan a las rutas ya existentes de
  `organismos`/`localidades` (o un archivo de rutas nuevo para los
  catálogos puramente de referencia) — la organización exacta de
  archivos es una decisión de implementación, no de este spec.
- La autorización de "asignaciones de jueces de una UF" y "editores de un
  organismo" reutiliza exactamente la función ya usada por el resto de
  las subrutas de organismo (`esOwnerOEditor()`/`esAdmin()`) — sin
  ninguna variante nueva, tal como se pidió explícitamente.
- `asignacion_fueros` (fuero por asignación puntual, D8) queda fuera de
  esta feature — no tiene un consumidor identificado en `005`, y
  exponerla sin que nadie la vaya a usar sería alcance especulativo. Si
  `005` (u otra feature) la necesita más adelante, es una extensión
  natural de esta misma familia de endpoints, no un cambio de diseño.
- El catálogo de preguntas de taxonomía (ítem 5) es de solo lectura —
  igual que el resto de los catálogos — la administración de preguntas
  desde la UI (crearlas/editarlas) es explícitamente backlog (ítem 6 de
  `docs/expectativas-nueva-app.md`), no parte de esta feature.
