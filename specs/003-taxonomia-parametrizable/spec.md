# Feature Specification: Taxonomía de organismos parametrizable por preguntas

**Feature Branch**: `003-taxonomia-parametrizable`

**Created**: 2026-09-22

**Status**: Draft

**Input**: User description: "Reformulá el modelo de taxonomía de organismos (evaluaciones_taxonomicas, actualmente 9 columnas fijas validadas contra taxonomia_codigos) para que sea parametrizable por preguntas, no por columnas fijas — sin agregar todavía una UI de administración. Modelo nuevo: taxonomia_preguntas (código, texto, grupo, tipo de respuesta, a qué tipo(s) de organismo aplica), taxonomia_opciones (opciones por pregunta, no un catálogo global), evaluaciones_taxonomicas pasa a ser una tabla de respuestas (una fila por respuesta; varias filas por multiple choice). Migración: las 9 preguntas actuales + sus opciones + las 89 evaluaciones ya migradas, cero pérdida. Fuera de alcance: UI de administración, taxonomía para tipos de organismo sin preguntas hoy, cambios a organismos/usuarios/UF."

## Contexto y alcance

El modelo actual (`001-modelo-datos-relacional`) representa la evaluación
taxonómica de un organismo como **una fila con 9 columnas fijas**
(`evaluaciones_taxonomicas`), cada una validada por un `CHECK` contra un
conjunto cerrado de códigos de una sola letra, con las etiquetas de esos
códigos en una tabla de catálogo (`taxonomia_codigos`). Agregar o modificar
una pregunta hoy requiere una migración de esquema (una columna nueva y su
`CHECK`), no una operación de datos.

Esta feature reformula ese modelo para que **una pregunta de taxonomía sea
un dato, no una columna**: agregar una pregunta nueva, o cambiar el
conjunto de opciones de una existente, pasa a ser una operación sobre
filas, no una migración de esquema. Es la base de datos que la
administración de taxonomía desde la UI (backlog, ítem 6 de
`docs/expectativas-nueva-app.md`) va a necesitar más adelante — pero esa UI
**no** es parte de esta feature: acá solo se sienta el modelo de datos
parametrizable.

**Hallazgo relevante para el alcance** (verificado contra los datos reales,
no asumido): las 9 preguntas actuales hoy no tienen, en ningún lugar del
código ni de los datos, un texto de pregunta real — la interfaz actual
(`src/components/TaxonomiaForm.jsx`) le muestra al usuario el nombre del
campo (`autonomia`, `jerarquia_normativa`, etc.) como si fuera la etiqueta,
no una oración. La migración de esta feature usa ese mismo nombre de campo
como texto de la pregunta migrada — no inventa una redacción de pregunta
que no existe hoy en ningún lado (Principio VII).

**Fuera de alcance explícito**:
- La UI de administración de preguntas/opciones (backlog, ítem 6 de
  `docs/expectativas-nueva-app.md`) — esta feature entrega el modelo de
  datos que esa UI va a consumir, no la UI.
- Definir preguntas de taxonomía para los tipos de organismo que hoy no la
  tienen (`coordinación`, `unidad operativa` — backlog, ítem 3 del mismo
  documento). Sus respuestas existentes (o su ausencia) se migran tal cual
  están, sin agregar preguntas nuevas para ellos.
- Cualquier cambio a `organismos`, `usuarios`, `unidades_funcionales`, o a
  cualquier otra parte del modelo de `001-modelo-datos-relacional` que no
  sea la taxonomía.
- El backend (`002-backend-api-carga-datos`): esta feature es solo el
  modelo de datos y su migración; los endpoints que expongan esta
  taxonomía nueva son una feature de backend aparte.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Las 9 preguntas y sus 89 respuestas migran sin pérdida (Priority: P1) 🎯 MVP

Como responsable del modelo de datos, necesito que las 9 preguntas de
taxonomía actuales (con sus opciones) y las 89 evaluaciones ya cargadas por
los referentes provinciales existan en el modelo nuevo exactamente con el
mismo significado que tienen hoy, sin que ningún referente note un cambio
en lo que ya cargó.

**Why this priority**: es el requisito no negociable de cualquier
reformulación de esquema sobre datos ya migrados (Principio X, mismo
criterio que `001-modelo-datos-relacional`) — sin esto, no hay nada más que
valga la pena construir encima.

**Independent Test**: comparar, para cada uno de los 89 organismos con
evaluación, las 9 respuestas que tenía en el modelo viejo (una por columna)
contra las filas que tiene en la tabla de respuestas nueva — mismo valor,
mismo organismo, misma pregunta, en las dos direcciones (nada de más, nada
de menos).

**Acceptance Scenarios**:

1. **Given** las 9 columnas fijas y sus `CHECK` del modelo actual, **When**
   se migran a preguntas parametrizadas, **Then** existen exactamente 9
   filas en el catálogo de preguntas, una por columna actual, cada una con
   su grupo original (gestión/institucional/organización/implementación) y
   marcada como de opción única.
2. **Given** los códigos válidos de cada una de las 9 columnas (hoy en
   `taxonomia_codigos`), **When** se migran, **Then** cada código pasa a
   ser una opción propia de su pregunta correspondiente — no una fila de un
   catálogo global compartido entre preguntas distintas.
3. **Given** las 89 evaluaciones ya cargadas (una fila de 9 valores cada
   una), **When** se migran, **Then** cada una se transforma en 9 filas de
   respuesta (organismo, pregunta, opción elegida) — 801 filas de respuesta
   en total (89 × 9), ni una más ni una menos.
4. **Given** el conteo de origen (89 evaluaciones, 9 columnas cada una) y el
   conteo de destino (filas de respuesta), **When** se reconcilian,
   **Then** el resultado se registra igual que toda migración de esta
   reformulación (mismo mecanismo de `001-modelo-datos-relacional`,
   Principio X) — "corrió sin error" no alcanza como evidencia.

---

### User Story 2 - Una pregunta nueva no requiere cambiar el esquema (Priority: P2)

Como responsable del modelo de datos, quiero poder agregar una pregunta de
taxonomía nueva (con sus opciones, si es categórica) insertando filas, sin
escribir ni ejecutar una migración de esquema (`ALTER TABLE`).

**Why this priority**: es el objetivo central de la reformulación — sin
esto, el modelo nuevo no aporta nada sobre el actual, solo lo complica.

**Independent Test**: agregar una pregunta de prueba (con dos opciones) por
inserción de filas únicamente, cargar una respuesta para un organismo
existente, y confirmar que ninguna sentencia de cambio de esquema fue
necesaria para que exista y acepte una respuesta válida.

**Acceptance Scenarios**:

1. **Given** el modelo parametrizado, **When** se agrega una pregunta
   categórica nueva con sus opciones, **Then** la operación es enteramente
   de datos (insertar filas en el catálogo de preguntas y en el de
   opciones), sin tocar la definición de ninguna tabla.
2. **Given** una pregunta nueva de tipo numérico o de texto libre, **When**
   se agrega, **Then** no requiere ninguna fila en el catálogo de opciones
   (esas opciones son exclusivas de preguntas categóricas o de opción
   múltiple).
3. **Given** una pregunta de opción múltiple, **When** un organismo
   responde eligiendo más de una opción, **Then** existe una fila de
   respuesta por cada opción elegida para ese par organismo-pregunta — no
   una fila con varios valores concatenados.

---

### User Story 3 - Una respuesta no puede referir una opción de otra pregunta (Priority: P2)

Como responsable de la integridad del modelo, necesito que sea imposible
guardar una respuesta que use una opción que no pertenece a la pregunta que
se está respondiendo — el error de integridad que el modelo actual evita
con un `CHECK` por columna debe seguir siendo imposible en el modelo
parametrizado, no solo "raro".

**Why this priority**: reformular el esquema no puede degradar una garantía
de integridad que ya existe (Principio VIII) — la validación por `CHECK`
de hoy se reemplaza por una garantía equivalente, no se pierde.

**Independent Test**: intentar registrar una respuesta que apunte a una
opción que pertenece a una pregunta distinta de la que se está
respondiendo, y confirmar que el modelo lo rechaza por diseño, no por
convención de la aplicación.

**Acceptance Scenarios**:

1. **Given** dos preguntas categóricas distintas, cada una con sus propias
   opciones, **When** se intenta guardar una respuesta a la pregunta A
   usando una opción que pertenece a la pregunta B, **Then** el modelo lo
   rechaza.
2. **Given** una pregunta de tipo numérico o de texto libre, **When** se
   intenta guardar una respuesta con una opción (en vez de un valor libre),
   **Then** el modelo lo rechaza — las preguntas no categóricas no aceptan
   `opcion_id`.
3. **Given** una pregunta categórica de opción única, **When** se intenta
   guardar más de una respuesta para el mismo par organismo-pregunta,
   **Then** el modelo lo rechaza (a diferencia de una pregunta de opción
   múltiple, donde sí es válido).

### Edge Cases

- Un organismo de un tipo que hoy no tiene ninguna respuesta cargada
  (`coordinación`, la mayoría de `unidad operativa`) → sigue sin ninguna
  fila de respuesta después de la migración; no se le crean respuestas
  vacías ni se le asignan preguntas "no contestadas".
- El caso real ya verificado de una `unidad operativa` que **sí** tiene
  evaluación cargada (1 de 13 — organismo id=311, "OFICINA DE GESTIÓN Y
  APOYO MEDIACIÓN (OGA MEDIACIÓN)") → migra igual que cualquier otro
  organismo con evaluación, sin que el campo "a qué tipo(s) de organismo
  aplica" de la pregunta lo bloquee — ese campo es informativo/orientador
  para carga futura, no una restricción retroactiva sobre datos ya
  cargados (Principio X: no se pierde ni se rechaza un dato real ya
  existente). *Contexto, no confirmado:* hipótesis de Santi es que este
  organismo tuvo su `tipo_oficina` distinto al momento de cargar la
  taxonomía, y que la app actual no borra `evaluaciones_taxonomicas` al
  cambiarlo — no se verificó contra un historial (no existe uno), así que
  queda como hipótesis, no como hecho verificado. No cambia la decisión de
  arriba: el dato se preserva igual, se explique o no por qué existe.
- Una pregunta marcada como aplicable a un tipo de organismo determinado no
  impide, por sí sola, que un organismo de otro tipo tenga una respuesta
  registrada — ver punto anterior.
- Dos preguntas de grupos distintos con el mismo código de opción (p. ej.
  "A") → no son la misma opción; cada opción pertenece a una sola pregunta,
  nunca se comparte entre preguntas (a diferencia de `taxonomia_codigos`
  hoy, donde el código sí se reutiliza entre columnas con significados
  distintos).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema MUST representar cada pregunta de taxonomía como
  un registro de datos (código, texto, grupo, tipo de respuesta, tipo(s) de
  organismo al que orienta su aplicación) — no como una columna de la tabla
  de evaluaciones.
- **FR-002**: El sistema MUST soportar, como tipo de respuesta de una
  pregunta, al menos: categórica de opción única, categórica de opción
  múltiple, numérica, y texto libre.
- **FR-003**: El sistema MUST representar las opciones válidas de una
  pregunta categórica o de opción múltiple como datos propios de esa
  pregunta — MUST NOT compartir un conjunto de opciones entre dos preguntas
  distintas, ni siquiera cuando coincida el código o el texto de la opción.
- **FR-004**: El sistema MUST NOT permitir que una pregunta de tipo
  numérico o de texto libre tenga opciones asociadas.
- **FR-005**: El sistema MUST registrar cada respuesta de un organismo a
  una pregunta como su propio registro (organismo, pregunta, y — según el
  tipo de la pregunta — la opción elegida o un valor libre), MUST NOT
  volver a un modelo de una fila con múltiples columnas de respuesta.
- **FR-006**: El sistema MUST permitir múltiples registros de respuesta
  para el mismo par organismo-pregunta únicamente cuando la pregunta es de
  opción múltiple; para los demás tipos, MUST existir a lo sumo una
  respuesta por par organismo-pregunta.
- **FR-007**: El sistema MUST rechazar por diseño una respuesta cuya opción
  elegida no pertenezca a la pregunta que esa respuesta dice responder.
- **FR-008**: El sistema MUST rechazar por diseño una respuesta con opción
  elegida para una pregunta de tipo numérico o de texto libre, y una
  respuesta con valor libre para una pregunta categórica o de opción
  múltiple.
- **FR-009**: El sistema MUST migrar las 9 preguntas actuales como
  preguntas categóricas de opción única, conservando su grupo original
  (gestión/institucional/organización/implementación) y usando el nombre
  de campo actual como texto de la pregunta (Principio VII — no existe hoy
  ningún texto de pregunta más descriptivo que migrar).
- **FR-010**: El sistema MUST migrar cada código de `taxonomia_codigos`
  como una opción de su pregunta correspondiente, conservando su etiqueta y
  orden.
- **FR-011**: El sistema MUST migrar las 89 evaluaciones ya cargadas a
  filas de respuesta equivalentes, sin pérdida ni alteración de los valores
  ya registrados, y MUST reconciliar el conteo de origen contra el de
  destino con el mismo mecanismo de `001-modelo-datos-relacional`
  (Principio X) — deteniéndose ante cualquier discrepancia, en vez de
  continuar y reportarla después.
- **FR-012**: El campo "a qué tipo(s) de organismo aplica" de una pregunta
  MUST ser informativo (para orientar qué preguntas mostrar a futuro) y
  MUST NOT usarse para rechazar o descartar una respuesta ya existente de
  un organismo de un tipo distinto al indicado.
- **FR-013**: El sistema MUST permitir agregar una pregunta nueva (y sus
  opciones, si corresponde) mediante operaciones de datos únicamente, sin
  requerir una migración de esquema.

### Key Entities *(include if feature involves data)*

- **Pregunta de taxonomía**: código, texto, grupo
  (gestión/institucional/organización/implementación), tipo de respuesta
  (opción única / opción múltiple / numérica / texto libre), y el o los
  tipos de organismo a los que orienta su aplicación (informativo, no
  restrictivo sobre datos ya cargados). Reemplaza a las 9 columnas fijas de
  hoy.
- **Opción de pregunta**: código, etiqueta, orden; pertenece a exactamente
  una pregunta categórica o de opción múltiple. Reemplaza al catálogo
  global `taxonomia_codigos` — dos preguntas nunca comparten sus opciones,
  aunque coincida el código.
- **Respuesta**: organismo, pregunta, y — según el tipo de la pregunta —
  una opción elegida o un valor libre (numérico o texto). Reemplaza a la
  fila de 9 columnas de `evaluaciones_taxonomicas`; una pregunta de opción
  múltiple puede tener varias respuestas del mismo organismo a la misma
  pregunta, una por opción elegida.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El 100% de las 9 preguntas actuales y sus opciones existen en
  el modelo nuevo, con el mismo grupo y las mismas opciones (código,
  etiqueta, orden) que tenían en `taxonomia_codigos`.
- **SC-002**: El 100% de las 89 evaluaciones ya cargadas resulta en la
  misma cantidad de respuestas migradas que de valores originales (89 × 9 =
  801), verificado por reconciliación de conteo origen/destino, con 0
  discrepancias sin resolver.
- **SC-003**: Agregar una pregunta de taxonomía nueva (con sus opciones) no
  requiere ninguna operación de cambio de esquema — se verifica insertando
  una pregunta de prueba y una respuesta válida a un organismo existente
  sin ejecutar ningún `ALTER TABLE`.
- **SC-004**: El 100% de los intentos de guardar una respuesta con una
  opción que no pertenece a la pregunta que se está respondiendo se
  rechazan.
- **SC-005**: El 100% de los intentos de guardar más de una respuesta para
  el mismo par organismo-pregunta en una pregunta que no es de opción
  múltiple se rechazan.
- **SC-006**: 0 organismos de los que ya tenían evaluación cargada (89)
  quedan con menos respuestas después de la migración que columnas
  respondidas tenían antes.

## Assumptions

- El texto de cada una de las 9 preguntas migradas es el nombre de su campo
  actual (`autonomia`, `insercion_institucional`, etc.) — no existe hoy, en
  código ni en datos, una redacción de pregunta más descriptiva que migrar;
  redactar preguntas más claras es una mejora de contenido a futuro (posible
  candidato para el backlog de la UI de administración, ítem 6), no parte
  de esta reformulación de esquema.
- "A qué tipo(s) de organismo aplica" se puebla, para las 9 preguntas
  migradas, según el patrón real observado en los datos (`oficina judicial`
  y `oficina judicial especializada`, que concentran 88 de las 89
  evaluaciones), pero es un dato orientador — el caso real ya verificado de
  una `unidad operativa` con evaluación cargada migra igual, sin quedar
  bloqueado por ese campo.
- El backend (`002-backend-api-carga-datos`) y su ruta
  `GET/PUT /api/organismos/:orgId/taxonomia` no son parte de esta feature;
  adaptarlos al modelo nuevo (o mantener una capa de compatibilidad
  temporal) es una decisión de una feature de backend posterior, fuera de
  este alcance.
- El pipeline de reporting (BigQuery/Looker Studio, D2 en
  `docs/decisiones-pendientes.md`) sigue leyendo de donde lee hoy; adaptar
  esas vistas al modelo nuevo de taxonomía es una decisión de esa feature,
  no de esta.
- No se agregan preguntas nuevas de taxonomía en esta feature (ni para los
  tipos de organismo que ya la tienen ni para los que no) — solo se
  reformula el esquema que sostiene las 9 preguntas y 89 evaluaciones ya
  existentes.
