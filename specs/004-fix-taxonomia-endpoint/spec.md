# Feature Specification: Endpoint de taxonomía de organismos, reconstruido para el modelo parametrizable

**Feature Branch**: `004-fix-endpoint-taxonomia`

**Created**: 2026-09-22

**Status**: Draft

**Input**: User description: "Arreglá el endpoint de taxonomía de organismos (GET/PUT /api/organismos/:orgId/taxonomia, feature 002-backend-api-carga-datos), roto desde que 003-taxonomia-parametrizable reemplazó el esquema de 9 columnas fijas por una tabla de respuestas (organismo, pregunta, opción/valor) con tipos de respuesta variables (opción única, opción múltiple, numérica, texto libre). GET debe devolver todas las respuestas del organismo, agrupadas por pregunta, en una forma que el frontend pueda consumir sin conocer el esquema interno — incluyendo el texto y tipo de cada pregunta, no solo el id. PUT debe aceptar un body con las respuestas del organismo y aplicar los cambios de forma atómica: reemplazar completamente el conjunto de respuestas de ese organismo en una transacción, respetando las mismas reglas de integridad ya garantizadas por el esquema, con un error claro al cliente si el trigger rechaza algo, no un 500 genérico. Autorización: misma regla ya vigente para unidades_funcionales/taxonomia. MUST incluir cobertura de test — no existía antes (D11), es la causa raíz de que la regresión no se detectara. Fuera de alcance: otros endpoints, el esquema de taxonomía en sí, la UI de administración de preguntas."

**Ampliación de alcance (2026-09-22)**: "Ampliá el alcance de
004-fix-taxonomia-endpoint para incluir dos protecciones nuevas,
relacionadas con el caso histórico de OGA Mediación (organismo id=311)
pero mirando hacia adelante, no hacia atrás: Protección A — guardia al
escribir una respuesta nueva: verificar (trigger) que el tipo_oficina_id
actual del organismo esté entre los tipos aplicables de esa pregunta; no
revalida filas ya existentes. Protección B — aviso + confirmación al
cambiar el tipo de un organismo (`PATCH /api/organismos/:id`): sin
confirmación explícita, rechazar listando qué se perdería; con
confirmación, aplicar el cambio y borrar (DELETE real, sin historial ni
archivado) las evaluaciones que ya no corresponden, en la misma
transacción; si no se pierde nada, proceder sin aviso. Sin ningún
mecanismo de historial, archivado o restauración — decisión explícita."

## Contexto

`002-backend-api-carga-datos` expuso `GET`/`PUT /api/organismos/:orgId/taxonomia`
contra el esquema viejo de `evaluaciones_taxonomicas` (9 columnas fijas, una
por pregunta). `003-taxonomia-parametrizable` reformuló ese esquema a una
tabla de respuestas (`organismo`, `pregunta`, `opción o valor libre`), con
preguntas de 4 tipos de respuesta posibles. El endpoint nunca se actualizó
para el esquema nuevo: `PUT` falla en firme (columnas que ya no existen),
`GET` no falla pero devuelve una forma de datos que ya no corresponde a
ninguna consulta útil (documentado en `docs/decisiones-pendientes.md`,
D11). Esta feature reconstruye ambos verbos contra el esquema real vigente,
sin reabrir ninguna decisión ya cerrada sobre ese esquema.

**Ampliación de alcance (2026-09-22)**: al reconstruir el endpoint se
identificó un caso ya documentado (`specs/003-taxonomia-parametrizable/spec.md`,
Edge Cases de esa feature — no `docs/decisiones-pendientes.md`, corregido
acá para citar la ubicación real) que hoy no tiene ninguna protección hacia
adelante: el organismo id=311 ("OGA MEDIACIÓN") tiene respuestas de
taxonomía cargadas para preguntas que no aplican a su tipo actual
(`unidad operativa`). Esa feature dejó ese dato histórico intacto a
propósito (Principio X: no se pierde ni se rechaza un dato real ya
existente) y documentó, sin confirmar, la hipótesis de que el organismo
tuvo otro `tipo_oficina` al momento de cargar la taxonomía. Esta feature
agrega dos protecciones que miran hacia adelante, no hacia atrás — no
tocan ni revalidan ese dato histórico —, para que la misma situación no
vuelva a producirse sin que nadie lo note:

- **Protección A**: ninguna respuesta *nueva* puede guardarse para una
  combinación (organismo, pregunta) donde el tipo actual del organismo no
  está entre los tipos aplicables de esa pregunta.
- **Protección B**: cambiar el tipo de un organismo que ya tiene
  respuestas de taxonomía cargadas para preguntas que dejarían de aplicar
  requiere una confirmación explícita, con aviso previo de qué se perdería.

**Fuera de alcance explícito**:
- Cualquier cambio a otro endpoint que no sea el aviso/confirmación de
  pérdida de taxonomía de la Protección B — en particular, `PATCH
  /api/organismos/:id` se modifica únicamente para agregar esa protección
  cuando el pedido cambia el tipo de organismo; ningún otro campo ni
  comportamiento de ese endpoint cambia. Cualquier otro endpoint
  (`unidades_funcionales`, `usuarios`, `pools_jueces`, `localidades`,
  `auth`) queda fuera de alcance sin excepción.
- Cualquier cambio al modelo de datos de taxonomía más allá de la guarda
  de la Protección A (un trigger nuevo, mismo patrón que los ya existentes
  de `003-taxonomia-parametrizable`) — la forma de `taxonomia_preguntas`,
  `taxonomia_opciones`, `evaluaciones_taxonomicas` no cambia.
- Revalidar, migrar, o corregir de cualquier forma datos históricos ya
  cargados (incluido, explícitamente, el organismo id=311) — las dos
  protecciones nuevas son estrictamente hacia adelante.
- Cualquier mecanismo de historial, archivado, o restauración de
  respuestas de taxonomía eliminadas por un cambio de tipo confirmado —
  decisión explícita de no implementarlo (ver Assumptions).
- La UI de administración de preguntas/opciones (backlog, ítem 6 de
  `docs/expectativas-nueva-app.md`) — esta feature es solo el endpoint (y,
  ahora, el aviso de pérdida) que esa UI (u otro consumidor) va a usar más
  adelante.
- Cualquier regla de autorización nueva — se reutiliza la ya vigente para
  las demás subrutas de `organismos`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Consultar la taxonomía cargada de un organismo (Priority: P1)

Como usuario con acceso al organismo (dueño, editor, o admin), quiero
consultar las respuestas de taxonomía ya cargadas de ese organismo, en una
forma legible que incluya de qué trata cada pregunta y qué tipo de
respuesta es, sin tener que conocer cómo está modelada la taxonomía por
dentro.

**Why this priority**: sin esto no hay forma de ver el estado actual de la
taxonomía de un organismo — es la mitad de lectura del endpoint roto, y la
que cualquier consumidor futuro (incluida la UI de administración,
backlog) necesita primero.

**Independent Test**: pedir la taxonomía de un organismo real que ya tiene
respuestas cargadas (uno de los 89 migrados en `003`) y confirmar que la
respuesta incluye, para cada pregunta respondida, su código, su texto, su
tipo de respuesta, y el valor de la respuesta (opción u opciones
seleccionadas, o el valor libre/numérico) — sin necesidad de consultar
ninguna otra tabla para interpretarla.

**Acceptance Scenarios**:

1. **Given** un organismo con las 9 respuestas migradas de `003`, **When**
   un usuario autorizado pide su taxonomía, **Then** la respuesta trae 9
   entradas, cada una con el código y texto de su pregunta, su tipo de
   respuesta (`opcion_unica`), y la opción seleccionada (código y
   etiqueta).
2. **Given** un organismo real sin ninguna evaluación de taxonomía cargada
   todavía, **When** un usuario autorizado pide su taxonomía, **Then** la
   respuesta es exitosa (no un error) y no trae ninguna entrada.
3. **Given** un `:orgId` que no corresponde a ningún organismo existente,
   **When** se pide su taxonomía, **Then** el sistema responde que no fue
   encontrado, igual que el resto de las subrutas de `organismos`.

---

### User Story 2 - Reemplazar la taxonomía de un organismo de una sola vez (Priority: P1)

Como usuario con acceso al organismo, quiero enviar el conjunto completo
de respuestas de taxonomía de ese organismo y que se apliquen todas juntas
o ninguna, para no dejar la taxonomía del organismo en un estado a medio
guardar si algo del conjunto enviado es inválido.

**Why this priority**: es la otra mitad del endpoint roto, y la que
permite que la taxonomía de un organismo pueda cargarse o corregirse en
absoluto contra el modelo nuevo.

**Independent Test**: enviar un conjunto de respuestas válido para un
organismo real (incluyendo una pregunta de opción múltiple con más de una
opción seleccionada) y confirmar, en una lectura posterior, que la
taxonomía del organismo es exactamente ese conjunto — ni de más ni de
menos, incluidas las respuestas que existían antes y no se reenviaron.

**Acceptance Scenarios**:

1. **Given** un organismo con una taxonomía cargada, **When** se envía un
   conjunto nuevo de respuestas válido, distinto del anterior, **Then**
   una lectura posterior devuelve exactamente el conjunto nuevo — las
   respuestas viejas que no se reenviaron ya no están.
2. **Given** una pregunta de tipo opción múltiple, **When** se envían dos
   o más opciones seleccionadas para esa pregunta en el mismo pedido,
   **Then** las dos quedan guardadas como respuestas independientes del
   organismo a esa pregunta.
3. **Given** un organismo con una taxonomía cargada, **When** se envía un
   conjunto vacío, **Then** el organismo queda sin ninguna respuesta de
   taxonomía después del pedido (el reemplazo también sirve para borrar
   todo).
4. **Given** un organismo con una taxonomía cargada, **When** el pedido de
   reemplazo falla por cualquier motivo (ver User Story 3), **Then** la
   taxonomía del organismo queda exactamente como estaba antes del
   intento — nada del conjunto enviado se aplica parcialmente.

---

### User Story 3 - Recibir un error identificable al enviar un conjunto inválido (Priority: P2)

Como usuario que envía un reemplazo de taxonomía, quiero que, si el
conjunto que mandé viola alguna de las reglas ya garantizadas por el
esquema (una opción que no pertenece a la pregunta que dice responder, una
respuesta con una forma que no corresponde al tipo de esa pregunta, más de
una respuesta para una pregunta que no admite varias), el sistema me lo
diga de forma clara y accionable — no un error genérico de servidor que no
distingue "mandé algo mal" de "el sistema se rompió".

**Why this priority**: es explícitamente lo que el pedido del usuario
señala como riesgo concreto ("el endpoint debe devolver un error claro al
cliente si el trigger rechaza algo, no un 500 genérico") y es necesario
para que un consumidor pueda corregir su propio pedido, pero no bloquea
que las dos historias anteriores funcionen para el caso feliz.

**Independent Test**: enviar un conjunto de respuestas que a propósito
viola una de las reglas de integridad ya existentes (por ejemplo, una
opción que pertenece a otra pregunta) y confirmar que la respuesta es un
error de cliente identificable, que menciona qué pregunta/regla falló, y
que una lectura posterior muestra que la taxonomía del organismo no
cambió.

**Acceptance Scenarios**:

1. **Given** un organismo con una taxonomía cargada, **When** se envía un
   reemplazo donde una respuesta usa la opción de una pregunta distinta a
   la que dice responder, **Then** el sistema rechaza el pedido entero con
   un error de cliente que identifica cuál respuesta es inválida y por
   qué, no un error de servidor genérico.
2. **Given** lo mismo, **When** ocurre el rechazo, **Then** una lectura
   posterior de la taxonomía del organismo muestra que no cambió nada
   respecto de antes del intento.
3. **Given** una pregunta que no es de opción múltiple, **When** se envía
   más de una respuesta para esa pregunta en el mismo conjunto, **Then**
   el sistema rechaza el pedido entero con un error de cliente que
   identifica la pregunta duplicada.
4. **Given** una pregunta de tipo numérico o de texto libre, **When** se
   envía una respuesta con una opción en vez de un valor libre/numérico
   (o viceversa), **Then** el sistema rechaza el pedido entero con un
   error de cliente que identifica la pregunta y la forma esperada.

---

### User Story 4 - Impedir que una respuesta nueva quede mal asignada al tipo de organismo (Protección A) (Priority: P2)

Como responsable de la integridad de la taxonomía, quiero que ninguna
respuesta *nueva* pueda guardarse para una pregunta que no aplica al tipo
actual del organismo que la responde, para que la situación del organismo
id=311 ("OGA MEDIACIÓN" — una `unidad operativa` con respuestas cargadas
para preguntas que solo aplican a `oficina judicial`/`oficina judicial
especializada`, documentada como caso histórico no confirmado en
`specs/003-taxonomia-parametrizable/spec.md`) no vuelva a producirse sin
que nadie lo note.

**Why this priority**: es una protección hacia adelante, no un
requisito para que el endpoint reconstruido funcione en su caso feliz —
depende de que el reemplazo (User Story 2) ya exista para tener algo que
proteger, pero no bloquea la lectura ni la escritura básica.

**Independent Test**: intentar guardar, para un organismo de un tipo que
no está entre los tipos aplicables de una pregunta dada, una respuesta a
esa pregunta, y confirmar que se rechaza con un error identificable —
mientras que una respuesta histórica ya cargada en esa misma situación
(el caso real de id=311) sigue existiendo sin cambios.

**Acceptance Scenarios**:

1. **Given** una pregunta que solo aplica a organismos de tipo "oficina
   judicial"/"oficina judicial especializada", **When** se intenta guardar
   una respuesta a esa pregunta para un organismo de un tipo distinto,
   **Then** el sistema rechaza la escritura con un error identificable.
2. **Given** el organismo id=311, con una respuesta histórica ya cargada
   para una pregunta que no aplica a su tipo actual, **When** se consulta
   su taxonomía o se guarda cualquier respuesta *nueva* para ese mismo
   organismo (a una pregunta distinta, que sí aplica), **Then** la
   respuesta histórica sigue existiendo sin cambios — esta protección no
   revalida ni elimina datos ya guardados.
3. **Given** una pregunta que aplica a dos tipos de organismo distintos,
   **When** se guarda una respuesta para un organismo de cualquiera de
   esos dos tipos, **Then** se acepta normalmente.

---

### User Story 5 - Avisar y confirmar antes de perder taxonomía al cambiar el tipo de un organismo (Protección B) (Priority: P3)

Como usuario que cambia el tipo de un organismo, quiero que, si ese
organismo tiene respuestas de taxonomía que dejarían de aplicar con el
tipo nuevo, el sistema me avise exactamente qué se perdería antes de
aplicar el cambio, y solo lo aplique (junto con la eliminación de esas
respuestas) si confirmo explícitamente que quiero seguir — para no perder
datos de taxonomía por un cambio de tipo hecho sin saber que tenía ese
efecto (la misma falta de aviso que, hipotéticamente, originó el caso de
id=311).

**Why this priority**: cierra el otro extremo del mismo riesgo que la
Protección A previene en la escritura — acá el riesgo es un cambio a
`PATCH /api/organismos/:id`, un endpoint de otra feature, por lo que
depende de que la Protección A y el resto de este endpoint ya estén
resueltos antes de tocar ese código ajeno.

**Independent Test**: pedir el cambio de tipo de un organismo que tiene
respuestas para preguntas que no aplican al tipo nuevo, sin ningún
parámetro de confirmación, y confirmar que se rechaza con un error que
lista esas preguntas/respuestas; repetir el mismo pedido con la
confirmación explícita y confirmar que el tipo cambia y esas respuestas
ya no existen, en una sola operación.

**Acceptance Scenarios**:

1. **Given** un organismo con respuestas cargadas para preguntas que no
   aplican al tipo nuevo, **When** se pide cambiar su tipo sin ningún
   parámetro de confirmación, **Then** el cambio se rechaza y el error
   lista exactamente qué preguntas (y sus respuestas) se perderían.
2. **Given** el mismo pedido, **When** se reenvía con la confirmación
   explícita, **Then** el tipo cambia y las respuestas que ya no
   correspondían al tipo nuevo quedan eliminadas, ambas cosas en la misma
   operación atómica.
3. **Given** un organismo cuya taxonomía cargada corresponde igual de bien
   al tipo nuevo (ninguna pregunta respondida queda fuera del conjunto
   aplicable al tipo nuevo), **When** se pide el cambio de tipo, **Then**
   el cambio procede sin pedir ninguna confirmación y sin eliminar nada.
4. **Given** un organismo sin ninguna respuesta de taxonomía cargada,
   **When** se pide cambiar su tipo, **Then** el cambio procede sin ningún
   aviso — no hay nada que perder.

---

### Edge Cases

- Un pedido de reemplazo incluye una pregunta que no existe (código
  desconocido): se rechaza con un error de cliente identificable, no se
  aplica nada del conjunto.
- Un pedido de reemplazo incluye una respuesta *nueva* para una pregunta
  cuyo "tipo de organismo aplicable" no coincide con el tipo actual del
  organismo: se rechaza (Protección A, User Story 4) — a diferencia de una
  respuesta que ya existía antes de esta feature, que nunca se revalida
  ni se ve afectada (mismo criterio de no tocar datos históricos ya
  resuelto en `003-taxonomia-parametrizable`, FR-012;
  ver Assumptions).
- Un usuario sin ser dueño, editor, ni admin del organismo intenta leer o
  reemplazar su taxonomía: se rechaza con el mismo error de autorización
  que ya usan las demás subrutas de `organismos` (unidades funcionales).
- Un pedido sin autenticar intenta leer o reemplazar la taxonomía de
  cualquier organismo: se rechaza igual que el resto de la API.
- Un organismo tiene una pregunta de opción múltiple con cero opciones
  seleccionadas en el conjunto enviado: es equivalente a no responder esa
  pregunta (queda sin respuesta después del reemplazo), no es un error.
- Se cambia el tipo de un organismo a uno cuyo conjunto de preguntas
  aplicables es un superconjunto del tipo actual (todas las preguntas que
  ya podía responder, y más): ninguna respuesta queda huérfana, el cambio
  procede sin aviso (mismo caso que "sin ninguna respuesta cargada").
- Se envía la confirmación explícita de pérdida (Protección B) en un
  pedido donde en realidad no había ninguna respuesta que fuera a
  perderse: el cambio procede igual — una confirmación de más no es un
  error, no hace falta que el cliente sepa de antemano si hacía falta o
  no.
- El organismo id=311 específicamente: ninguna de las dos protecciones
  nuevas lo toca de forma retroactiva. La Protección A no revalida su
  respuesta histórica ya cargada. La Protección B solo se activaría si, en
  el futuro, alguien pidiera cambiarle el tipo a través de este mismo
  endpoint — no hay ninguna corrida automática que lo audite o corrija
  como parte de esta feature.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema MUST devolver, al consultar la taxonomía de un
  organismo, cada respuesta agrupada por su pregunta, incluyendo el código
  y texto de la pregunta y su tipo de respuesta — no solo un identificador
  interno.
- **FR-002**: El sistema MUST incluir en cada entrada devuelta, según el
  tipo de la pregunta, la opción (u opciones) seleccionada con su código y
  etiqueta, o el valor libre/numérico respondido.
- **FR-003**: El sistema MUST devolver una respuesta exitosa sin entradas
  (no un error) al consultar un organismo real que todavía no tiene
  ninguna evaluación de taxonomía cargada.
- **FR-004**: El sistema MUST rechazar con "no encontrado" la consulta o
  el reemplazo de taxonomía de un `:orgId` que no corresponde a ningún
  organismo existente, igual que las demás subrutas de `organismos`.
- **FR-005**: El sistema MUST aceptar, para el reemplazo, un conjunto que
  describa la o las respuestas deseadas por pregunta (una respuesta para
  preguntas de opción única/numérica/texto libre; una o más para preguntas
  de opción múltiple), identificando cada pregunta y cada opción por su
  código — no por un identificador interno que el consumidor no tendría
  forma de conocer de antemano.
- **FR-006**: El sistema MUST aplicar un reemplazo de taxonomía de forma
  atómica: o se aplica el conjunto completo enviado, o no se aplica nada,
  sin importar en qué parte del conjunto esté el problema.
- **FR-007**: El sistema MUST tratar toda pregunta ausente del conjunto
  enviado como "sin respuesta" después del reemplazo — incluida una
  pregunta que sí tenía una respuesta previa y no fue reenviada.
- **FR-008**: El sistema MUST permitir un reemplazo con un conjunto vacío,
  dejando al organismo sin ninguna respuesta de taxonomía.
- **FR-009**: El sistema MUST rechazar por completo, con un error de
  cliente identificable (no un error de servidor genérico), cualquier
  conjunto enviado que viole alguna de las reglas de integridad ya
  garantizadas por el esquema de taxonomía: una opción que no pertenece a
  la pregunta que dice responder; una respuesta cuya forma no corresponde
  al tipo de la pregunta que responde; más de una respuesta para una
  pregunta que no es de opción múltiple.
- **FR-010**: El error devuelto por un reemplazo rechazado MUST identificar
  qué pregunta (o qué parte del conjunto enviado) violó qué regla, no
  solo que "algo falló".
- **FR-011**: El sistema MUST dejar la taxonomía previa del organismo sin
  ningún cambio cuando un reemplazo es rechazado.
- **FR-012**: El sistema MUST aplicar, tanto para consultar como para
  reemplazar la taxonomía de un organismo, la misma regla de autorización
  ya vigente para las demás subrutas de `organismos` (dueño o editor del
  organismo, o administrador) — sin ninguna variante propia de taxonomía.
- **FR-013**: El sistema MUST rechazar con un error de cliente
  identificable un reemplazo que incluya una pregunta cuyo código no
  existe en el catálogo de preguntas de taxonomía.
- **FR-014**: El sistema MUST rechazar, al guardar una respuesta *nueva*
  (inserción o actualización, por cualquier camino — no solo a través de
  este endpoint) para una pregunta, si el tipo de organismo actual del
  organismo que responde no está entre los tipos de organismo aplicables
  de esa pregunta (Protección A). *Corrige una versión anterior de este
  mismo requisito*, que asumía —siguiendo el criterio de su propio FR-012
  para datos ya existentes, de `003-taxonomia-parametrizable`— que este
  campo nunca sería restrictivo; la ampliación de alcance de esta feature
  invierte esa decisión específicamente para escrituras nuevas (no para
  `003-taxonomia-parametrizable`.FR-012 en sí, que sigue vigente tal cual
  para datos ya existentes — ver Assumptions).
- **FR-015**: El sistema MUST tener cobertura de prueba automatizada para
  consultar y reemplazar la taxonomía de un organismo, incluyendo al menos
  un caso que ejercite un reemplazo rechazado de punta a punta (no solo la
  regla de integridad en aislamiento) — este endpoint se rompió sin que
  ninguna prueba lo detectara (`docs/decisiones-pendientes.md`, D11), y esa
  ausencia de cobertura es la causa raíz documentada de esa regresión.
- **FR-016**: El error devuelto por un rechazo de la Protección A MUST
  identificar la pregunta y el tipo de organismo involucrados, no un error
  genérico.
- **FR-017**: El sistema MUST NOT revalidar, modificar, ni eliminar
  ninguna respuesta ya existente como consecuencia de introducir la
  Protección A — protege únicamente escrituras nuevas de ahí en adelante;
  una respuesta histórica en esa misma situación (el caso real de id=311)
  sigue existiendo sin cambios.
- **FR-018**: El sistema MUST rechazar un pedido de cambio de tipo de
  organismo (`PATCH /api/organismos/:id`) cuando ese organismo tiene
  respuestas de taxonomía cargadas para preguntas que no aplican al tipo
  nuevo, salvo que el pedido incluya una confirmación explícita de que se
  acepta esa pérdida (Protección B).
- **FR-019**: El error de un rechazo por FR-018 MUST enumerar cuáles
  preguntas (y sus respuestas) se perderían si el cambio se confirmara.
- **FR-020**: El sistema MUST, ante un pedido de cambio de tipo con la
  confirmación explícita, aplicar el cambio de tipo y eliminar las
  respuestas que ya no corresponden al tipo nuevo en la misma operación
  atómica — ambas cosas ocurren juntas, o ninguna.
- **FR-021**: El sistema MUST permitir un cambio de tipo de organismo sin
  pedir ninguna confirmación cuando ninguna respuesta de taxonomía cargada
  queda fuera del conjunto de preguntas aplicables al tipo nuevo (incluido
  el caso de un organismo sin ninguna respuesta cargada, y el caso de un
  tipo nuevo cuyo conjunto de preguntas aplicables incluye a todas las del
  tipo actual).
- **FR-022**: El sistema MUST NOT conservar ningún registro, archivo, ni
  mecanismo de historial de las respuestas eliminadas por un cambio de
  tipo confirmado (Protección B) — es una eliminación real y definitiva,
  decisión explícita para evitar el costo de un mecanismo de historial que
  no se va a usar (ver Assumptions).
- **FR-023**: El sistema MUST tener cobertura de prueba automatizada para
  ambas protecciones nuevas, incluyendo al menos un caso que confirme que
  una respuesta histórica en la situación de la Protección A no se ve
  afectada por su introducción.

### Key Entities *(include if feature involves data)*

- **Taxonomía de un organismo (vista de consulta/reemplazo)**: la
  colección de respuestas de un organismo a las preguntas de taxonomía
  (`003-taxonomia-parametrizable`), expuesta y modificada a través de este
  endpoint como un conjunto único por organismo — no se introduce ninguna
  entidad de datos nueva, esta feature es la forma en la que la API
  consulta y reemplaza las entidades ya existentes (`taxonomia_preguntas`,
  `taxonomia_opciones`, `evaluaciones_taxonomicas`).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Consultar la taxonomía de cualquiera de los organismos
  reales existentes (con o sin evaluación cargada) responde exitosamente,
  0% de errores de servidor.
- **SC-002**: Reemplazar la taxonomía de un organismo con un conjunto
  válido y volver a consultarla de inmediato devuelve exactamente ese
  conjunto — ni respuestas de más, ni de menos, ni de otro organismo.
- **SC-003**: El 100% de los intentos de reemplazo que violan una regla de
  integridad ya existente se rechazan con un error identificable por el
  cliente (no un error de servidor genérico), y dejan la taxonomía previa
  del organismo intacta, verificado por consulta posterior.
- **SC-004**: 0% de los pedidos autorizados y bien formados a este
  endpoint terminan en un error de servidor genérico.
- **SC-005**: Una prueba automatizada de este endpoint corre como parte de
  la suite de tests del backend y falla si el endpoint deja de funcionar
  contra el esquema real — de haber existido antes de
  `003-taxonomia-parametrizable`, habría detectado la regresión en el
  momento en que se aplicó la migración de esquema, no después.
- **SC-006**: El 100% de los intentos de guardar una respuesta *nueva*
  para una combinación (organismo, pregunta) donde el tipo actual del
  organismo no aplica a esa pregunta se rechaza, verificado sin alterar
  ninguna fila preexistente en esa misma situación (el caso histórico de
  id=311 sigue intacto después de la verificación).
- **SC-007**: El 100% de los pedidos de cambio de tipo de organismo que
  dejarían respuestas de taxonomía huérfanas se bloquean sin la
  confirmación explícita, y el bloqueo identifica exactamente cuáles
  respuestas se perderían — verificado contra el listado real de
  preguntas/respuestas devuelto.
- **SC-008**: El 100% de los pedidos de cambio de tipo confirmados aplican
  el cambio y eliminan exactamente las respuestas que dejaron de
  corresponder — verificado por lectura posterior: ninguna respuesta
  huérfana queda, ninguna respuesta que sí seguía correspondiendo se
  pierde.
- **SC-009**: El 100% de los cambios de tipo que no dejan ninguna
  respuesta huérfana (incluidos los organismos sin taxonomía cargada)
  proceden sin requerir ninguna confirmación.

## Assumptions

- Las preguntas y opciones se identifican, tanto en la respuesta de
  consulta como en el conjunto de reemplazo, por su código estable
  (`taxonomia_preguntas.codigo`, `taxonomia_opciones.codigo`) — el mismo
  identificador público que ya se usa en toda la feature
  `003-taxonomia-parametrizable` — y no por un identificador interno de
  base de datos, siguiendo el pedido explícito de que el consumidor no
  necesite conocer el esquema interno.
- "Devolver todas las respuestas del organismo" significa las respuestas
  que existen hoy para ese organismo — no una lista de todas las preguntas
  del catálogo con huecos para las no respondidas. Enumerar preguntas
  aplicables sin respuesta es una necesidad de una futura UI de
  administración (backlog, fuera de alcance de esta feature), no de este
  endpoint de lectura/escritura.
- El criterio de "a qué tipo(s) de organismo aplica" una pregunta es
  informativo y no retroactivo para datos **ya existentes** (así se
  resolvió en `003-taxonomia-parametrizable`, FR-012, y así sigue: el
  organismo id=311 conserva su respuesta histórica para una pregunta que
  no aplica formalmente a su tipo, sin que esta feature la toque). Para
  escrituras **nuevas**, en cambio, sí es restrictivo desde la Protección
  A de esta feature — es una decisión distinta para un momento distinto
  (guardar un dato nuevo vs. conservar uno ya guardado), no una
  contradicción entre ambas: ambas protegen que el sistema nunca *pierda*
  ni *rechace en falso* un dato real, y ahora además que no *cree* uno
  nuevo en una combinación que no corresponde.
- No se implementa ningún mecanismo de historial, archivado, ni
  restauración para las respuestas de taxonomía eliminadas por un cambio
  de tipo confirmado (Protección B) — decisión explícita para evitar el
  costo de construir y mantener un historial que no se va a usar; si ese
  dato hace falta después, es una pérdida consciente y documentada, no un
  bug.
- Ninguna de las dos protecciones nuevas ejecuta una corrida retroactiva
  sobre datos existentes al desplegarse — ni una revalidación masiva de
  `evaluaciones_taxonomicas` (Protección A), ni una limpieza automática de
  organismos con taxonomía ya inconsistente con su tipo actual (Protección
  B, que solo reacciona a un cambio de tipo futuro, pedido explícitamente
  a través del endpoint). El organismo id=311 es el ejemplo conocido de un
  caso que estas protecciones no corrigen por sí solas.
- "Confirmación explícita" (Protección B) es un campo booleano en el body
  del mismo pedido de cambio de tipo (`PATCH /api/organismos/:id`) — no un
  segundo endpoint, ni un flujo de confirmación en dos pasos separados.
- La autorización reutiliza exactamente la función ya usada por las
  subrutas de `unidades_funcionales` de `organismos` (dueño/editor del
  organismo padre, o admin) — no se define ninguna regla de autorización
  nueva ni distinta para taxonomía.
- Las reglas de integridad (una opción debe pertenecer a la pregunta que
  responde; la forma de la respuesta debe corresponder al tipo de la
  pregunta; una pregunta no-múltiple admite una sola respuesta) ya están
  garantizadas por el esquema (`003-taxonomia-parametrizable`) y no se
  vuelven a implementar en esta capa — esta feature es responsable de
  traducir su rechazo en un error de cliente identificable, no de
  duplicar la validación.
