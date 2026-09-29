# Feature Specification: Editar los fueros de un organismo

**Feature Branch**: `011-crud-fueros-organismo`

**Created**: 2026-09-28

**Status**: Draft

**Input**: User description: "Especificá el CRUD del listado de fueros concretos de un organismo (organismo_fueros) — pieza de la traducción original de la app actual (Sección 1, 1.2.1.4) que quedó sin construir en 005-frontend-cliente: hoy fuero_simplificado se muestra en solo lectura, calculado (D3), pero no existe ningún camino para editar el listado de fueros del que se calcula. Backend: hoy solo existe GET /api/organismos/:orgId/fuero. Falta el endpoint de escritura — agregar/quitar fueros del listado de un organismo. Autorización: misma regla ya vigente para datos de organismo (esOwnerOEditor()/esAdmin()), sin ninguna regla nueva. Frontend: reemplazar el texto de solo lectura de fuero_simplificado en DatosTab.tsx por un control de selección múltiple sobre el catálogo real de fueros (GET /api/fueros, ya existe desde 006), que guarde el listado elegido y muestre fuero_simplificado recalculado después de guardar — consistente con cómo D3 define el cálculo (un solo fuero => ese valor; más de uno => 'multifuero'). Migración de datos existentes: no aplica. Fuera de alcance: cualquier cambio al cálculo de fuero_simplificado en sí (ya cerrado, D3), y cualquier otra pantalla de 005 no relacionada con fueros."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Editar el listado de fueros de un organismo (Priority: P1)

Quien gestiona un organismo (su propietario, un editor agregado, o un
administrador) hoy solo puede VER un resumen calculado ("multifuero", el
nombre de un único fuero, o nada) sin ninguna forma de decir de qué fueros
concretos se trata. Con esta historia, esa misma persona puede elegir,
sobre el catálogo real de fueros, cuáles asiste el organismo, guardar esa
elección, y ver el resumen actualizado en consecuencia.

**Why this priority**: es la pieza entera de la traducción de la app
actual que quedó pendiente (Sección 1, 1.2.1.4 de la app original) — sin
esto, el dato calculado (`fuero_simplificado`) nunca puede completarse ni
corregirse para ningún organismo, y hoy varios ya quedaron en un estado
"sin fueros asignados" o "multifuero sin detalle" esperando esta pantalla
(D3).

**Independent Test**: entrar al detalle de un organismo propio, abrir el
control de fueros, elegir uno o más fueros del catálogo real, guardar, y
confirmar que el resumen mostrado cambia según lo elegido (un fuero =>
ese nombre; más de uno => "multifuero"; ninguno => sin fuero).

**Acceptance Scenarios**:

1. **Given** un organismo sin fueros asignados todavía, **When** su
   propietario elige un único fuero del catálogo y guarda, **Then** el
   organismo pasa a mostrar el nombre de ese fuero como resumen.
2. **Given** un organismo con un fuero ya asignado, **When** se agrega un
   segundo fuero y se guarda, **Then** el resumen mostrado pasa a decir
   "multifuero".
3. **Given** un organismo con varios fueros asignados, **When** se quitan
   todos y se guarda, **Then** el organismo vuelve a mostrarse sin fuero
   asignado (no queda un resumen calculado de una elección vacía).
4. **Given** una persona que NO es propietaria, editora, ni administradora
   de ese organismo, **When** intenta ver o editar su listado de fueros,
   **Then** se le niega exactamente como se le niega hoy cualquier otro
   dato de ese organismo — no hay una regla nueva ni una excepción para
   fueros.
5. **Given** un organismo que la migración original dejó como
   "multifuero, sin saber cuáles" (D3), **When** alguien con acceso completa
   por primera vez su listado real a través de esta pantalla, **Then**
   ese organismo queda con un listado explícito y el resumen refleja
   exactamente esos fueros, ya no una aproximación.

---

### User Story 2 - No permitir que un fuero en uso desaparezca en silencio (Priority: P2)

Una unidad funcional del organismo puede tener una asignación de jueces
acotada a uno de esos fueros en particular (no a todos los que asiste el
organismo). Si alguien quita ese fuero del listado del organismo sin que
el sistema lo avise, esa asignación queda apuntando a un fuero que el
organismo ya no dice asistir — una inconsistencia silenciosa.

**Why this priority**: no bloquea la Historia 1 (that already entrega
valor por sí sola) pero es necesaria antes de dar la funcionalidad por
completa, porque protege un dato ya existente de otra parte de la
aplicación (asignación de jueces por fuero).

**Independent Test**: en un organismo con una asignación de jueces
acotada a un fuero específico, intentar quitar justo ese fuero del
listado del organismo y confirmar que la acción se rechaza con un mensaje
claro, sin haber cambiado nada.

**Acceptance Scenarios**:

1. **Given** una unidad funcional con una asignación de jueces acotada
   específicamente a un fuero del organismo, **When** alguien intenta
   guardar un listado de fueros que ya no incluye ese fuero, **Then** el
   sistema rechaza el guardado con un mensaje que explica por qué, y el
   listado del organismo queda exactamente como estaba antes del intento.
2. **Given** el mismo caso anterior, **When** la asignación de jueces se
   quita o se deja de acotar a ese fuero primero, **Then** ahora sí se
   puede quitar ese fuero del listado del organismo sin que nada lo
   bloquee.

---

### Edge Cases

- ¿Qué pasa si dos personas con acceso al mismo organismo guardan
  listados de fueros distintos casi al mismo tiempo? El último guardado
  exitoso es el que queda — mismo comportamiento que ya tienen hoy otros
  datos editables del organismo, sin una regla de concurrencia nueva.
- ¿Qué pasa si el catálogo de fueros (`GET /api/fueros`) está vacío o no
  responde? La pantalla debe mostrarlo con claridad (no un listado vacío
  indistinguible de "el organismo no tiene fueros"), sin romperse.
- ¿Qué pasa con un organismo que ya tiene un listado real, cargado antes
  de esta feature? Se ve y se edita igual que cualquier otro — no hay un
  estado especial de "migrado" distinto de "cargado a mano".

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema MUST permitir que el propietario, un editor
  agregado, o un administrador de un organismo vea el listado actual de
  fueros concretos que asiste ese organismo.
- **FR-002**: El sistema MUST permitir que esa misma persona agregue y
  quite fueros de ese listado, eligiendo únicamente del catálogo real de
  fueros existente — nunca un valor libre.
- **FR-003**: Tras guardar, el sistema MUST mostrar el resumen recalculado
  a partir del listado guardado: el nombre del fuero cuando hay
  exactamente uno, "multifuero" cuando hay más de uno, y ningún resumen
  cuando no hay ninguno.
- **FR-004**: El sistema MUST NOT permitir quitar del listado un fuero que
  todavía tiene, en alguna unidad funcional de ese organismo, una
  asignación de jueces acotada específicamente a él — debe rechazar esa
  acción con un mensaje claro, no aplicarla parcialmente ni dejar datos
  inconsistentes.
- **FR-005**: Guardar un listado vacío MUST ser una acción válida (dice
  explícitamente "este organismo no asiste ningún fuero"), distinta de
  cualquier estado previo que solo signifique "todavía no se sabe" — una
  vez que alguien guarda a través de esta pantalla, el organismo deja de
  estar en un estado de dato pendiente por migración.
- **FR-006**: La autorización para ver y editar este listado MUST ser
  exactamente la misma regla que ya rige el resto de los datos de un
  organismo (propietario, editor agregado, o administrador) — sin una
  regla nueva ni una excepción para fueros.
- **FR-007**: El sistema MUST NOT modificar, como parte de esta
  funcionalidad, ningún dato de organismos ya cargado por fuera de lo que
  la propia persona guarda explícitamente a través de esta pantalla — no
  hay backfill ni reinterpretación automática de datos migrados.
- **FR-008**: El sistema MUST NOT cambiar la lógica de cómo se calcula el
  resumen a partir del listado (ya definida y cerrada) — esta
  funcionalidad solo agrega la forma de editar el listado del que ese
  cálculo parte.

### Key Entities

- **Fuero**: entidad de catálogo (nombre), ya existente — esta
  funcionalidad no agrega, edita, ni quita fueros del catálogo, solo
  decide cuáles aplican a cada organismo.
- **Listado de fueros de un organismo**: la relación entre un organismo y
  los fueros concretos que asiste — es lo nuevo que esta funcionalidad
  permite editar; puede estar vacío, tener uno, o tener varios.
- **Resumen de fueros** (el dato hoy visible): no es una entidad propia —
  es un valor derivado del listado de arriba, que esta funcionalidad no
  redefine, solo pasa a depender de un listado editable en vez de fijo.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Una persona con acceso a un organismo puede actualizar su
  listado de fueros y ver el resumen reflejarlo, sin salir de la pantalla
  del organismo ni recargar la página.
- **SC-002**: El campo que hoy es de solo lectura en el detalle del
  organismo pasa a ser editable, sin que ningún otro campo de esa misma
  pantalla cambie su comportamiento.
- **SC-003**: El 100% de los intentos de quitar un fuero todavía en uso
  por una asignación de jueces se detienen antes de guardar, sin dejar
  ninguna inconsistencia entre el listado del organismo y esa asignación.
- **SC-004**: Un organismo que quedó de la migración original en "sin
  fueros asignados" o "multifuero sin detalle" (D3) puede completarse con
  un listado real por una persona con acceso, sin necesitar ninguna
  intervención directa sobre la base de datos.

## Assumptions

- El catálogo de fueros en sí (`GET /api/fueros`, ya existente desde
  `006`) es fijo para esta funcionalidad: no se agrega, edita, ni elimina
  ningún fuero del catálogo — solo se elige cuáles aplican a un organismo
  puntual.
- Guardar es una única acción explícita sobre todo el listado elegido (la
  persona marca/desmarca fueros y confirma), no una serie de altas y
  bajas individuales encadenadas — es una decisión de forma, no cambia
  ningún requisito de esta spec.
- No hay límite de cantidad de fueros que un organismo puede tener
  asignados — cualquier subconjunto del catálogo, incluido vacío o
  completo, es válido.
- Esta funcionalidad no toca ningún dato ya migrado a través de la
  pantalla nueva: los organismos que hoy están en `multifuero_sin_detalle`
  o `sin_fueros_asignados` siguen exactamente así hasta que una persona
  con acceso los complete a mano — no hay backfill automático como parte
  del uso normal de esta pantalla.
- **Relleno inicial, único, separado del uso normal de la pantalla** (no
  es algo que la persona usuaria dispare): para un organismo con
  `fuero_simplificado` en un valor único conocido (penal, civil, laboral,
  familia) y sin ninguna fila todavía en el listado de fueros, se carga
  esa única fila — es completar un dato ya implícito, no algo que deba
  hacerse a mano. Los organismos en `multifuero_sin_detalle` (D3, 20 casos
  confirmados) NO tienen un valor único que copiar y quedan **sin
  poblar**, esperando carga real por gestión con los referentes — no se
  inventa una distribución. Los que están en `sin_fueros_asignados` quedan
  sin cambios. **Verificado contra la base real (2026-09-28) antes de
  escribir esto**: hoy los 97 organismos en estado "cargado" ya tienen
  todos al menos una fila en el listado — este relleno resulta en **0
  filas a cargar en este momento**; se documenta igual porque describe la
  regla correcta si en algún momento aparece un caso así (otra fuente de
  datos, una carga futura que no pase por esta pantalla), no porque haya
  algo pendiente de aplicar hoy.
- Este relleno, si corresponde aplicarlo, es un proceso de una sola vez,
  separado del flujo normal de la pantalla — mismo criterio ya usado en
  el proyecto para este tipo de corrección de datos (modo de solo
  diagnóstico por defecto, mostrando antes/después, y una confirmación
  explícita para escribir en firme).
