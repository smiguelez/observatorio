# Feature Specification: Modelo de datos relacional y migración desde Firestore

**Feature Branch**: `001-modelo-datos-relacional`

**Created**: 2026-09-07

**Status**: Draft

**Input**: User description: "Especificá el modelo de datos relacional del observatorio, que reemplaza el almacenamiento actual en Firestore. Alcance: exclusivamente el modelo de datos y su migración desde Firestore. NO incluye backend, frontend ni reporting. No define motor de base de datos, tipos de columna ni stack — eso corresponde a /speckit-plan."

## Resumen

Esta feature define **qué entidades, atributos y relaciones** componen el modelo
de datos del Observatorio de Oficinas Judiciales, y **cómo migran** los datos que
hoy viven en Cloud Firestore hacia ese modelo. Es la primera de una secuencia de
features independientes (modelo → backend → frontend → reporting): sienta la base
sobre la que se construye todo lo demás.

El alcance es deliberadamente estrecho: **el modelo lógico y su migración**. No
incluye el diseño del backend, del frontend, ni de la capa de reporting, y **no
elige motor de base de datos, tipos de columna, índices ni stack** — todo eso
corresponde a `/speckit-plan` y a las features posteriores.

Insumos de esta especificación:
- `docs/auditoria-app-actual.md` — inventario de colecciones, campos y relaciones
  existentes en Firestore.
- `docs/decisiones-pendientes.md` — decisiones cerradas que aplican al modelo
  (D3: fueros como listado con `fuero_simplificado` calculado; D4: identidad de
  usuario con id subrogado; D7: `anio_implementacion` como año entero nullable;
  D8: relación UF↔jueces por tabla puente de asignaciones a grupos, con cantidad
  y fuero por fila, que reemplaza el modelo de tres estados de D6).
- `docs/verificacion-datos-firestore.md` — script de verificaciones sobre los
  datos reales que condiciona nulidad, tipos canónicos y limpieza de referencias
  (Principio VII de la constitución).
- `docs/resultado-verificacion-general-20260907.md` y
  `docs/resultado-verificacion-fueros-20260907.md` — **resultados fechados** de
  correr esas verificaciones sobre producción (2026-09-07). Reemplazan toda
  estimación previa: los conteos, tipos y referencias rotas de esta spec salen de
  ahí, no de supuestos.
- `.specify/memory/constitution.md` — Principios V, VII, VIII, IX y X gobiernan
  directamente esta feature.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Modelo relacional que representa fielmente el dominio actual (Priority: P1)

Como equipo del proyecto, necesito un modelo de datos que capture **todas** las
entidades, atributos y relaciones que hoy existen en Firestore, expresadas como
un esquema relacional normalizado, para que las features siguientes (backend,
frontend, reporting) se construyan sobre una base completa y sin ambigüedades.

**Why this priority**: sin un modelo completo, ninguna otra feature puede
empezar. Es el cimiento de toda la reformulación. Un atributo o una relación que
se pierda acá se pierde en todo lo que venga después.

**Independent Test**: se puede validar tomando la auditoría §2 y verificando que
cada colección, subcolección y campo documentado tiene una entidad/atributo
correspondiente en el modelo **o** una decisión explícita y justificada de
descartarlo; y que cada relación implícita descrita en la auditoría (§2.2, §2.3)
queda declarada como relación explícita del modelo.

**Acceptance Scenarios**:

1. **Given** el inventario de colecciones de la auditoría (`users`, `organismos`,
   `localidades`, `pools_jueces`, `unidades_funcionales`, `taxonomia`), **When**
   se revisa el modelo, **Then** cada colección se corresponde con al menos una
   entidad del modelo y ningún campo queda sin mapear ni sin una decisión de
   descarte registrada.
2. **Given** una relación implícita del sistema actual (p. ej.
   `unidades_funcionales.localidad_id` → `localidades`), **When** se revisa el
   modelo, **Then** la relación está declarada explícitamente entre las entidades
   correspondientes con su cardinalidad.
3. **Given** un campo que el código actual maneja pero la auditoría marca como
   código muerto o legado (p. ej. estructura de versionado `v1` de taxonomía),
   **When** se revisa el modelo, **Then** existe una decisión explícita de
   incluirlo, transformarlo o descartarlo, con su razón.
4. **Given** una UF que atiende varios grupos de jueces a la vez (p. ej. un pool
   compartido, un grupo exclusivo propio y un subconjunto numérico de otro pool),
   **When** se revisa el modelo, **Then** la relación UF↔jueces se expresa como
   asignaciones independientes en una tabla puente —una cantidad por fila, sin
   límite de una sola asignación por UF— capaces de representar los cinco casos de
   D8, y la ausencia de asistencia de jueces se expresa como cero asignaciones.
5. **Given** el ejemplo de D8 —UF1 con 5 jueces exclusivos + pool A completo (5,
   compartido con UF2) + subconjunto de 3 del pool B (10, que UF3 usa completo)—,
   **When** se calculan totales sobre el modelo, **Then** el conteo por UF da
   13 / 5 / 10 (sumando las asignaciones de cada UF sin deduplicar) y el agregado
   da 20 (cada grupo contado una sola vez por su total real: 5 + 5 + 10), nunca 28.

---

### User Story 2 - Migración con cero pérdida de datos, verificada por reconciliación (Priority: P1)

Como institución dueña del relevamiento federal, necesito que **todos** los
registros existentes en Firestore lleguen al modelo nuevo, con evidencia
verificable de que no se perdió nada, para no destruir años de carga de datos de
24 jurisdicciones que no se pueden regenerar.

**Why this priority**: los datos son un relevamiento construido a lo largo de
años por referentes provinciales; no hay forma de recrearlos si se pierden
(Principio X). "Corrió sin error" no es evidencia de completitud.

**Independent Test**: se puede validar corriendo la migración y verificando que
el log de reconciliación reporta, por cada entidad, un conteo en origen igual al
conteo en destino; y que la fuente original queda accesible en modo solo lectura
como respaldo.

**Acceptance Scenarios**:

1. **Given** una entidad migrada (p. ej. `organismos`), **When** se compara el
   conteo de registros en origen con el conteo en destino, **Then** ambos
   coinciden y el resultado queda registrado en el log de reconciliación.
2. **Given** una discrepancia de conteo en una entidad, **When** corre la
   migración de esa entidad, **Then** el proceso se detiene para esa entidad hasta
   resolver la diferencia, en vez de continuar silenciosamente.
3. **Given** una migración completada, **When** se necesita auditar los datos
   originales, **Then** la fuente Firestore sigue disponible en modo solo lectura
   como respaldo verificable hasta el cierre formal del proyecto.
4. **Given** el conjunto de datos migrado, **When** se revisa el log, **Then**
   existe un registro de reconciliación por cada entidad del modelo con conteo de
   origen, conteo de destino y resultado (coincide / discrepancia resuelta).

---

### User Story 3 - Integridad referencial explícita, sin datos huérfanos (Priority: P2)

Como equipo del proyecto, necesito que las relaciones que hoy son referencias
sueltas se conviertan en relaciones con integridad garantizada, para que una
referencia inválida deje de ser posible por diseño en vez de degradar
silenciosamente. La verificación fechada del 2026-09-07 encontró **0 referencias
rotas** en los datos actuales (116 organismos, 277 UF), por lo que la carga no
requiere limpieza previa de referencias: la garantía se impone hacia adelante.

**Why this priority**: depende de que el modelo (US1) y los datos (US2) existan.
Hoy una referencia rota mostraría el id crudo o `'(pool)'` sin cantidad; en el
modelo nuevo esa fila no debe poder existir (Principio VIII). Que hoy no haya
ninguna rota no debilita la restricción: la evita para siempre.

**Independent Test**: se puede validar verificando que, en el destino, no existe
ninguna referencia que apunte a un registro inexistente en ninguna de las
relaciones del modelo. Como la verificación de origen ya reportó 0 referencias
rotas (V1.10, V2.13, V3.9, V3.10, V3.11), no hay decisiones de limpieza previa que
aplicar; si una corrida futura detectara alguna, tendría que resolverse antes de
la carga.

**Acceptance Scenarios**:

1. **Given** que la verificación V3.9/V3.10 reportó 0 UF con `localidad_id` o
   `pool_jueces_id` roto, **When** corre la migración, **Then** todas las UF cargan
   con su localidad y con sus asignaciones de jueces resueltas a grupos existentes,
   y no se genera ningún registro huérfano.
2. **Given** que la verificación V1.10/V2.13 reportó 0 organismos con propietario o
   editores apuntando a un usuario inexistente, **When** corre la migración,
   **Then** todas las referencias de propiedad y edición resuelven a un usuario
   existente sin limpieza previa.
3. **Given** el conjunto de datos migrado, **When** se recorren todas las
   relaciones del modelo, **Then** cero referencias apuntan a registros
   inexistentes.
4. **Given** una hipotética referencia rota detectada en una corrida futura de la
   verificación, **When** corre la migración, **Then** el modelo la rechaza por
   integridad referencial y la referencia debe resolverse antes de la carga.

---

### User Story 4 - Identidad de usuario con id subrogado (Priority: P2)

Como sistema que soportará múltiples métodos de autenticación, necesito que cada
usuario se identifique por un id interno subrogado (no por su email), con el email
como atributo único, y que las referencias de propiedad y edición de organismos
apunten a ese id, para que un mismo usuario resuelva a un único registro sin
importar cómo probó su identidad.

**Why this priority**: es la decisión D4 cerrada y el Principio V (identidad
unificada). Habilita que backend y autenticación (features posteriores) se
construyan sin volver a modelar la identidad. La verificación V1.1 confirmó que la
elección de id subrogado sobre email **no responde a un problema en los datos
actuales** (0 colisiones de email): es una decisión de diseño hacia adelante para
soportar múltiples métodos de auth, no una limpieza — en `users` no hay nada que
limpiar.

**Independent Test**: se puede validar verificando que toda referencia de
propiedad (`usuario_google`) y edición (`editores[]`) del modelo migrado apunta al
id subrogado de un usuario existente, no a un email, y que no hay dos usuarios
activos con el mismo email.

**Acceptance Scenarios**:

1. **Given** un usuario del sistema actual identificado por su email, **When** se
   migra, **Then** obtiene un id subrogado interno como identidad primaria y
   conserva el email como atributo único.
2. **Given** la propiedad de un organismo expresada hoy como
   `usuario_google = <email>`, **When** se migra, **Then** la propiedad queda
   expresada como referencia al id subrogado del usuario correspondiente.
3. **Given** la lista de editores de un organismo expresada hoy como un array de
   emails, **When** se migra, **Then** queda expresada como relación entre
   organismos y usuarios (por id subrogado), sin duplicados y sin diferencias de
   casing.
4. **Given** que la verificación V1.1 no encontró ninguna colisión de email por
   casing (0 de 46 usuarios: los 46 ids son emails válidos en minúscula que
   coinciden con el campo `email`), **When** se migra, **Then** cada email produce
   una identidad única sin necesidad de fusionar registros; la restricción de email
   único se mantiene por diseño para altas futuras.

---

### User Story 5 - Fueros como relación múltiple y `fuero_simplificado` calculado (Priority: P3)

Como institución, necesito que la asistencia de un organismo a fueros se modele
como un listado (un organismo puede asistir a varios fueros) y que
`fuero_simplificado` deje de cargarse a mano y pase a calcularse a partir de ese
listado, preservando el estado conocido de los datos actuales durante la carga
pendiente.

**Why this priority**: es la decisión D3 cerrada. Es importante pero la carga real
de los fueros de cada organismo la completan después los referentes provinciales;
lo que esta feature garantiza es la **estructura** y la **preservación del estado
actual**, no la carga completa.

**Independent Test**: se puede validar verificando que el modelo declara una
relación múltiple organismo↔fuero, que `fuero_simplificado` es derivable de esa
relación (multifuero cuando hay más de un fuero), y que la migración deja a cada
organismo en el estado correcto: fueros concretos cuando se conocen, o uno de los
dos estados de migración cuando no.

**Acceptance Scenarios**:

1. **Given** el catálogo de fueros individuales, **When** se revisa el modelo,
   **Then** existe una relación de cardinalidad múltiple entre organismos y
   fueros (un organismo puede asistir a cero, uno o varios fueros).
2. **Given** un organismo con más de un fuero asignado, **When** se determina su
   `fuero_simplificado`, **Then** su valor calculado es "multifuero"; **Given** un
   organismo con exactamente un fuero, **Then** su valor calculado es ese fuero.
3. **Given** un organismo sin valor en `fuero_simplificado` (situación que la
   verificación fechada del 2026-09-07 reporta en **0 casos** hoy, pero posible en
   altas futuras), **When** se migra o se da de alta, **Then** queda en estado
   `sin_fueros_asignados` (sin fueros concretos), pendiente de carga posterior.
4. **Given** los organismos que hoy dicen `multifuero` sin detalle (los **20
   confirmados** por la verificación fechada del 2026-09-07), **When** se migran,
   **Then** quedan en estado `multifuero_sin_detalle`, preservando el hecho
   conocido de que asisten a más de un fuero sin inventar cuáles.

---

### Edge Cases

Todos los casos borde de esta lista fueron **medidos** contra producción en la
corrida del 2026-09-07 (`docs/resultado-verificacion-general-20260907.md`); se
anota junto a cada uno lo que la verificación encontró.

- **Referencias rotas → 0 casos.** `localidad_id` y `pool_jueces_id` (V3.9/V3.10:
  0), coincidencia de provincia pool↔organismo (V3.11: 0), propietario y editores
  hacia `users` (V1.10/V2.13: 0). No hay referencias huérfanas que limpiar antes de
  la carga; la integridad se garantiza igual por diseño.
- **Jueces en UF → asignaciones a grupos, no tres estados.** Ninguna UF tiene
  cantidad directa y pool a la vez (V3.3: 0) y 2 UF (de 277) no tienen ninguno de
  los dos: son la única UF de organismos puramente administrativos ("Secretaria de
  gestión administrativa" y "Oficina de Gestión Digital"). En el modelo nuevo (D8)
  la relación UF↔jueces es una tabla puente de asignaciones a Grupos de Jueces con
  una cantidad por fila: las 2 UF administrativas migran a **cero asignaciones**
  (equivalente al antiguo `no_aplica`, distinguible de un dato faltante); las UF con
  cantidad directa migran a **una** asignación a un grupo exclusivo con esa cantidad;
  y las UF con pool migran a **una** asignación al pool compartido por su total. Los
  casos de múltiples pools por UF, pool + grupo propio y subconjunto de un pool **no
  aparecen en los datos actuales** —son conocimiento de dominio para carga futura—,
  así que la migración inicial produce a lo sumo una asignación por UF.
- **Rol → forma y valores consistentes.** `rol` es siempre array (V1.6: 0 no-array)
  y todos sus valores están en catálogo (V1.7: solo `usuario_normal` y `admin`). No
  requiere canonicalización de forma.
- **Colisión de email por casing → 0 casos.** Los 46 usuarios tienen ids que son
  emails válidos en minúscula, sin mayúsculas y sin mismatch contra el campo
  `email` (V1.1/V1.2: 0). No hay identidades que fusionar; el email único se
  sostiene por diseño.
- **`actualizado_a` con forma dual → 1 caso.** 115 de 116 organismos lo tienen como
  Timestamp y 1 como string ISO (`"2025-07-04T18:13:52.115Z"`); ninguno ausente
  (V2.8/V2.9). La migración debe parsear ese único string explícitamente, no asumir
  Timestamp uniforme.
- **Taxonomía → 1:1 confirmado y completa.** 0 organismos con más de un documento
  de taxonomía y 0 documentos con id distinto de `v1` (V0.3/V7.2). De los 88
  organismos cuyo tipo de oficina exige taxonomía, los 88 tienen las 9 columnas
  completas (V4.2), sin campos ausentes (V4.4: 0) ni grupos anidados vacíos (V4.5:
  0). El modelado 1:1 por organismo queda confirmado sin excepciones.
- **Denominación simplificada → solo catálogo vigente.** Los 116 organismos usan
  exactamente valores del catálogo actual de 10 (V2.4); no aparecen valores del
  catálogo anterior de 39. No hay mapeo legado que aplicar.
- **Editores con ruido → 0 casos.** `editores` es siempre array (V2.10: 0 no-array)
  y ningún organismo tiene emails duplicados (case-insensitive) en `editores[]`
  (V2.10: 0).
- **Localidades duplicadas → 0 casos.** 0 pares (nombre, provincia) duplicados
  (V5.2); `latitud`/`longitud` son siempre numéricos (V5.4). No hay que deduplicar
  localidades ni convertir coordenadas.
- **Valores numéricos como texto → solo `anio_implementacion`.** `jueces_asistidos`
  no tiene valores no convertibles (V3.6: 0), `cantidad_jueces` es siempre número
  (V6.4) y las coordenadas también (V5.4). El único campo con texto libre es
  `anio_implementacion` (V3.7), resuelto por D7 (ver FR-015/FR-027).
- **Colecciones no contempladas → ninguna.** Las colecciones raíz encontradas son
  exactamente las esperadas por el código (`users`, `organismos`, `localidades`,
  `pools_jueces`); no hay colecciones inesperadas (V0.2). `organismos` conserva sus
  subcolecciones `unidades_funcionales` y `taxonomia`.
- **Campos de contacto/completitud vacíos en UF (dato faltante real, no
  limpieza).** Persisten vacíos legítimos que no bloquean el modelo: `jueces_asistidos`
  (36), `telefono` (12), `responsable` (12), `mail` (10), `domicilio` (2),
  `codigo_postal` (2), `anio_implementacion` (1) (V3.4). Se migran como nulos; su
  completitud es carga posterior.
- **Perfiles de usuario mínimos → 3 casos.** 3 de 46 usuarios tienen solo
  `{email, rol, provincia}` (V1.5); el resto de atributos de perfil se migra como
  nulo, no como error.

## Requirements *(mandatory)*

### Functional Requirements

**Cobertura y fidelidad del modelo**

- **FR-001**: El modelo MUST representar cada colección y subcolección
  documentada en la auditoría (`users`, `organismos`, `localidades`,
  `pools_jueces`, `unidades_funcionales`, `taxonomia`) mediante una o más
  entidades del modelo relacional.
- **FR-002**: Cada campo documentado en la auditoría §2 MUST mapear a un atributo
  o relación del modelo, **o** tener una decisión explícita de descarte con su
  razón registrada (Principio XII).
- **FR-003**: El modelo MUST inventariar y resolver las colecciones o
  subcolecciones que el código actual no toca pero que existan en el proyecto
  (V0.2), antes de declararse completo.

**Identidad de usuario (D4, Principio V)**

- **FR-004**: El modelo MUST representar al Usuario con un identificador interno
  subrogado como identidad primaria, independiente del email.
- **FR-005**: El Usuario MUST conservar el email como atributo único: no puede
  haber dos usuarios activos con el mismo email. La verificación V1.1 confirmó 0
  colisiones por casing (46 de 46 ids son emails en minúscula que coinciden con el
  campo `email`), por lo que la unicidad no exige fusionar registros existentes; se
  impone como restricción hacia adelante.
- **FR-006**: El modelo MUST capturar los atributos de perfil del usuario que hoy
  existen: nombre para mostrar, email, verificación de email, referencia de foto,
  marcas temporales de creación de cuenta, último ingreso y creación del lado del
  proveedor, y provincia.
- **FR-007**: El modelo MUST permitir que un usuario tenga uno o más roles del
  catálogo (`admin`, `usuario_normal`), representados de forma normalizada y no
  como un valor de texto libre.

**Organismos y sus relaciones (Principio VIII)**

- **FR-008**: El modelo MUST representar al Organismo con sus atributos actuales:
  denominación, denominación simplificada, tipo de oficina, provincia, id legado
  (`legacy_id`, nullable) y marca temporal de última actualización. La verificación
  V2.11 confirmó que `legacy_id` es siempre string numérico o `null` (8 nulls de
  116), sin inconsistencias de tipo; la columna es nullable y su tipo concreto
  (entero o texto) se decide en `/speckit-plan`.
- **FR-009**: El modelo MUST expresar la propiedad de un organismo como una
  relación al id subrogado del Usuario propietario (reemplaza
  `organismos.usuario_google`, que hoy guarda un email).
- **FR-010**: El modelo MUST expresar la relación de edición organismo↔usuario
  como una relación explícita de cardinalidad múltiple (tabla puente), por id
  subrogado, sin duplicados ni diferencias de casing (reemplaza el array
  `organismos.editores[]`).

**Fueros (D3)**

- **FR-011**: El modelo MUST declarar una relación de cardinalidad múltiple entre
  Organismo y Fuero: un organismo puede asistir a cero, uno o varios fueros.
- **FR-012**: El modelo MUST definir `fuero_simplificado` como un valor
  **derivable** del listado de fueros del organismo, no como un dato cargado a
  mano: "multifuero" cuando hay más de un fuero, y el fuero único cuando hay
  exactamente uno. (Dónde se materializa el cálculo —columna generada, cálculo en
  backend o vista— NO se decide en esta spec; corresponde a `/speckit-plan`.)
- **FR-013**: El modelo MUST contemplar el estado `sin_fueros_asignados` (sin
  fueros concretos) para organismos sin fuero conocido, pendientes de carga
  posterior por gestión. La verificación fechada del 2026-09-07 reporta **0
  organismos sin `fuero_simplificado`**, por lo que este estado aplica a **0 casos
  en la migración inicial** y se mantiene en el modelo para altas futuras.
- **FR-014**: La migración MUST dejar a los organismos que hoy dicen `multifuero`
  sin detalle (**20 organismos confirmados** por la verificación fechada del
  2026-09-07) en el estado `multifuero_sin_detalle`, preservando el hecho conocido
  de que asisten a más de un fuero sin inventar cuáles. Este estado MUST ser
  distinguible de `sin_fueros_asignados`.

**Unidades funcionales, localidades y pools**

- **FR-015**: El modelo MUST representar la Unidad Funcional como entidad
  perteneciente a un único Organismo, con sus atributos actuales (denominación de
  unidad, tipo de UF, año de implementación, domicilio, teléfono, mail,
  responsable, código postal). El año de implementación se modela según D7 como una
  única columna `anio_implementacion` de tipo entero, nullable (regla de extracción
  en FR-027).
- **FR-016**: El modelo MUST declarar la relación Unidad Funcional → Localidad
  como relación con integridad referencial garantizada (reemplaza `localidad_id`
  suelto).
- **FR-017**: El modelo MUST declarar la relación Unidad Funcional ↔ Grupo de
  Jueces mediante una **tabla puente de asignaciones**, no como un `pool_jueces_id`
  único por UF: cada asignación vincula una UF con un Grupo de Jueces y lleva su
  propia cantidad asignada. Una UF puede tener **cero, una o varias** asignaciones.
  La relación MUST tener integridad referencial garantizada en ambos extremos (toda
  asignación resuelve a una UF y a un Grupo existentes; reemplaza el `pool_jueces_id`
  suelto y su límite de un solo pool por UF).
- **FR-018**: El modelo MUST representar la asistencia de jueces de una Unidad
  Funcional mediante **asignaciones a Grupos de Jueces** (la tabla puente de FR-017,
  con una cantidad por fila), reemplazando el modelo de tres estados excluyentes de
  D6 (`jueces_asistidos` / `pool_jueces_id` / `no_aplica`). Según D8 (RESUELTA,
  2026-09):
  - **(a) Grupos, no jueces individuales.** Un *Grupo de Jueces* es un pool
    compartido por varias UF **o** un grupo exclusivo de una sola UF. El modelo MUST
    registrar solo **cantidades**, nunca jueces por nombre (confirmado con Santi:
    alcanza con cuántos, no hace falta saber cuáles).
  - **(b) Múltiples asignaciones por UF.** Una UF puede acceder a **varios pools a la
    vez**; a uno o más pools **más** un grupo propio no compartido; o a un
    **subconjunto numérico** de un pool (una cantidad menor que su total) mientras
    otras UF acceden al pool completo. Cada caso es una fila de la tabla puente con
    su propia cantidad.
  - **(c) Ausencia de jueces = cero asignaciones.** Una UF de un organismo
    administrativo sin jueces por diseño se representa como **ausencia de filas** en
    la tabla puente (cero asignaciones), no como un valor discriminador; reemplaza el
    estado `no_aplica`. Esa ausencia MUST seguir siendo distinguible de un dato
    faltante (V3.3: 2 de 277 UF — "Secretaria de gestión administrativa" y "Oficina
    de Gestión Digital").
  - **(d) Total real por grupo.** Cada Grupo de Jueces MUST conservar su **total
    real** de jueces, independiente de las cantidades que cada UF le asigne. Los
    subconjuntos y el acceso completo al mismo pool se **solapan a propósito** (una UF
    puede ver 3 de los mismos 10 que otra ve completos); el modelo MUST NOT imponer
    que las cantidades asignadas a un grupo sumen su total.
  - **(e) Dos reglas de conteo que el modelo MUST poder soportar** (la
    materialización de las consultas es de reporting, fuera de alcance; lo que esta
    spec exige es que el modelo **preserve la información suficiente** —cantidad y
    grupo por asignación, total real por grupo— para computar ambas sin ambigüedad):
    - **Por UF (individual):** se suman **todas** las cantidades asignadas a esa UF,
      **sin deduplicar** (incluye subconjuntos que se solapan con otras UF).
    - **Agregado (localidad, provincia, etc.):** se cuenta **cada grupo una sola vez**
      usando su **total real** — nunca sumando las cantidades por-UF de ese grupo.
  - **(f) Fuero por asignación.** El fuero no es atributo fijo de la UF ni del grupo,
    sino de la **asignación**. Cada asignación hereda por defecto los fueros de su
    Unidad Funcional (los que la UF atiende, derivados de su Organismo — FR-011) y MAY
    acotarlos a un subconjunto cuando esa asignación específica atiende menos fueros
    que la UF en general. **Restricción:** los fueros de una asignación MUST NOT
    exceder los de la UF que la origina. La agregación por fuero se hace **por
    asignación** (cada asignación aporta al fuero o fueros que declara, no a todos los
    de la UF ni por UF completa), de modo que un grupo compartido entre UF de distinto
    fuero puede aportar a más de un fuero.
- **FR-019**: El modelo MUST representar la Localidad con sus atributos actuales
  (nombre, provincia, latitud, longitud).
- **FR-020**: El modelo MUST representar el Grupo de Jueces con su **total real** de
  jueces y su provincia (y la descripción cuando exista). Un Grupo puede ser un
  **pool compartido** —referenciable desde varias UF, que hoy corresponde a la
  colección `pools_jueces` (descripción, cantidad de jueces, provincia)— o un **grupo
  exclusivo** de una sola UF, que la migración deriva de las UF que hoy llevan
  cantidad directa (`jueces_asistidos`), modeladas como grupo de un solo miembro. La
  verificación V6.4 confirmó `cantidad_jueces` siempre numérico.

**Taxonomía**

- **FR-021**: El modelo MUST representar la evaluación taxonómica de un organismo
  con las nueve dimensiones actuales agrupadas en gestión, institucional,
  organización e implementación, cada una con su valor del catálogo de códigos
  correspondiente.
- **FR-022**: El modelo MUST modelar la evaluación taxonómica como una relación de
  a lo sumo una evaluación por organismo (1:1). La verificación V0.3 / V7.2 del
  2026-09-07 confirmó esta cardinalidad **sin excepciones**: 0 organismos con más de
  un documento de taxonomía y 0 documentos con id distinto de `v1`. Además, de los
  88 organismos cuyo tipo de oficina exige taxonomía, los 88 tienen las 9 columnas
  completas (V4.2).
- **FR-023**: La migración MUST canonicalizar a la forma única del modelo cualquier
  forma divergente de la taxonomía. La verificación del 2026-09-07 encontró la
  taxonomía limpia en lo medido: 0 campos ausentes o vacíos (V4.4) y 0 grupos
  anidados vacíos (V4.5) sobre los 88 organismos completos. Las divergencias de
  forma que ese script no cubrió (doble-anidado, valores no-string, códigos fuera de
  catálogo — V4.3/V4.6/V4.7) MUST verificarse antes de la carga y, si aparecieran,
  canonicalizarse.

**Catálogos / vocabularios controlados**

- **FR-024**: El modelo MUST tratar como vocabularios controlados los conjuntos de
  valores hoy definidos por catálogo: denominación simplificada (10 valores), tipo
  de oficina (4), provincia (24), tipo de UF (`Delegación` / `Subdelegación` /
  `Área Específica`), fueros individuales y códigos de taxonomía. (La forma de
  materializarlos —tabla de referencia o enumeración— NO se decide en esta spec.)

**Integridad referencial y limpieza (Principio VIII)**

- **FR-025**: El modelo MUST declarar como relaciones con integridad garantizada
  todas las que hoy son referencias sueltas: UF→localidad, UF↔grupos de jueces
  (asignaciones), organismo→propietario, organismo↔editores, organismo↔fueros.
- **FR-026**: Toda referencia rota detectada por las verificaciones (V1.10, V2.13,
  V3.9, V3.10, V3.11) MUST resolverse (limpieza o mapeo) **antes** de la carga; no
  se cargan registros huérfanos. La corrida del 2026-09-07 reportó **0 referencias
  rotas** en las 116 organismos y 277 UF, por lo que no hay limpieza previa
  pendiente; la restricción de integridad se aplica igual, para que cualquier
  referencia rota futura sea imposible por diseño.

**Canonicalización de datos divergentes (Principio VII)**

- **FR-027**: La migración MUST canonicalizar a una única forma los campos cuya
  divergencia confirmó la verificación del 2026-09-07:
  - **`actualizado_a`**: 115 de 116 organismos como Timestamp y 1 como string ISO
    (`"2025-07-04T18:13:52.115Z"`), ninguno ausente (V2.8/V2.9). La migración MUST
    parsear ese string explícitamente en vez de asumir Timestamp uniforme.
  - **`anio_implementacion`**: texto libre (fechas, descripciones, valores sin
    sentido) que se canoniza a un año entero según D7 (regla abajo).

  La misma verificación confirmó que **no** requieren canonicalización: `rol`
  (siempre array — V1.6), `cantidad_jueces` (siempre número — V6.4),
  `latitud`/`longitud` (siempre número — V5.4) y `jueces_asistidos` (0 valores no
  convertibles — V3.6).

  Regla de `anio_implementacion` (D7): una sola columna entera nullable; se extrae
  el año cuando hay una fecha reconocible (`"1/7/2021"` → 2021); queda `null` cuando
  no hay ningún año identificable (`"9"`, cadena vacía); y `"2015. Refuncionalización
  2024"` se resuelve como **2015** (año de implementación original, no el de la
  refuncionalización posterior).
- **FR-028**: Las decisiones de nulidad, tipo canónico y tratamiento de cada
  divergencia (limpiar, mapear o aceptar variabilidad) MUST tomarse a partir de los
  resultados fechados del 2026-09-07
  (`docs/resultado-verificacion-general-20260907.md` y
  `docs/resultado-verificacion-fueros-20260907.md`), no de los supuestos del código
  (Principio VII). Esta spec ya incorpora esos resultados; los tipos de columna
  concretos se deciden en `/speckit-plan`.
- **FR-029**: Los valores legados que quedan fuera de catálogo (p. ej.
  denominación simplificada del listado anterior de 39, códigos de taxonomía fuera
  de catálogo) MUST tener una decisión de mapeo o preservación registrada antes de
  la carga.

**Migración y reconciliación (Principios IX y X)**

- **FR-030**: La migración MUST transferir cada registro de cada colección y
  subcolección de origen a la entidad correspondiente del modelo.
- **FR-031**: La migración MUST producir un log de reconciliación con conteo en
  origen y conteo en destino por cada entidad.
- **FR-032**: Si un conteo de origen y destino no coincide, la migración de esa
  entidad MUST detenerse hasta resolver la discrepancia; "corrió sin error" MUST
  NOT aceptarse como evidencia de completitud.
- **FR-033**: La fuente de datos original (Firestore) MUST permanecer disponible
  en modo solo lectura como respaldo verificable hasta el cierre formal del
  proyecto.
- **FR-034**: La migración MUST poder descomponerse y verificarse por entidad, sin
  requerir un único corte simultáneo de todo el conjunto (Principio IX).

### Key Entities *(include if feature involves data)*

- **Usuario**: persona que accede al sistema. Identidad primaria por id subrogado
  interno; email como atributo único. Atributos de perfil (nombre, foto,
  verificación de email, marcas temporales, provincia). Se relaciona con Rol
  (múltiple), es propietario de Organismos y editor de Organismos.
- **Rol**: catálogo de roles del sistema (`admin`, `usuario_normal`). Relación
  múltiple con Usuario.
- **Organismo**: oficina judicial relevada. Atributos: denominación, denominación
  simplificada, tipo de oficina, provincia, id legado, marca de actualización.
  Tiene un Usuario propietario, cero o más Usuarios editores, cero o más Fueros,
  cero o más Unidades Funcionales, y a lo sumo una Evaluación Taxonómica.
  `fuero_simplificado` es un valor derivado, no almacenado a mano.
- **Editor (relación Organismo↔Usuario)**: relación de cardinalidad múltiple que
  reemplaza el array `editores[]`; conecta organismos con los usuarios habilitados
  a editarlos, por id subrogado.
- **Fuero**: catálogo de fueros individuales que un organismo puede asistir
  (p. ej. penal, civil, familia, laboral). Relación múltiple con Organismo.
- **Estado de fuero simplificado**: además de los valores derivables del listado,
  contempla dos estados de migración —`sin_fueros_asignados` y
  `multifuero_sin_detalle`— que preservan el estado conocido de los datos actuales
  durante la carga pendiente.
- **Unidad Funcional**: delegación/subdelegación/área específica de un organismo.
  Atributos de contacto y ubicación (incluido `anio_implementacion` como año entero
  nullable). Pertenece a un Organismo, referencia una Localidad, y declara su
  asistencia de jueces mediante **cero o más Asignaciones** a Grupos de Jueces. Cero
  asignaciones = organismo administrativo sin jueces por diseño (reemplaza el antiguo
  `no_aplica`, 2 casos confirmados), distinguible de un dato faltante.
- **Localidad**: localidad geográfica (nombre, provincia, latitud, longitud).
  Referenciada por Unidades Funcionales.
- **Grupo de Jueces**: agrupación de jueces con un **total real** y una provincia.
  Puede ser un *pool compartido* (referenciado por varias UF; corresponde a la
  colección `pools_jueces` — descripción, cantidad de jueces, provincia) o un *grupo
  exclusivo* de una sola UF (derivado en la migración de las UF con cantidad directa).
  Su total real es independiente de las cantidades que cada UF le asigne.
- **Asignación de Jueces (relación Unidad Funcional↔Grupo de Jueces)**: fila de la
  tabla puente que vincula una UF con un Grupo y registra la **cantidad asignada**
  (el total del grupo o un subconjunto numérico) y los **fueros** que esa asignación
  atiende (por defecto los de la UF, acotables a un subconjunto, nunca excedentes). Es
  la unidad de agregación por fuero. Una UF tiene cero o más asignaciones; un pool
  compartido es referenciado por varias.
- **Evaluación Taxonómica**: valoración de un organismo en nueve dimensiones
  agrupadas (gestión, institucional, organización, implementación), cada una con
  un código de catálogo. A lo sumo una por organismo.
- **Vocabularios controlados**: conjuntos de valores válidos para denominación
  simplificada, tipo de oficina, provincia, tipo de UF y códigos de taxonomía.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El 100% de las colecciones y subcolecciones documentadas en la
  auditoría §2 está representado en el modelo; cada campo tiene un mapeo o una
  decisión de descarte registrada (0 campos sin resolver).
- **SC-002**: Tras la migración, para cada entidad del modelo el conteo de
  registros en origen es igual al conteo en destino, evidenciado en el log de
  reconciliación (0 entidades con discrepancia sin resolver).
- **SC-003**: Tras la migración, existen 0 referencias que apunten a registros
  inexistentes en cualquier relación del modelo (el origen ya está en 0 según
  V1.10/V2.13/V3.9/V3.10/V3.11 del 2026-09-07).
- **SC-004**: El 100% de las relaciones de propiedad y edición de organismos
  apunta al id subrogado de un usuario existente; 0 referencias por email.
- **SC-005**: Existen 0 usuarios activos con email duplicado. La verificación V1.1
  ya reportó 0 colisiones por casing en los 46 usuarios de origen, así que la
  migración parte de un conjunto sin duplicados; la restricción se mantiene para
  altas futuras.
- **SC-006**: Para el 100% de los organismos (116 según la verificación del
  2026-09-07), `fuero_simplificado` es determinable a partir de su listado de
  fueros o de uno de los dos estados de migración; **0 organismos** quedan en
  `sin_fueros_asignados` (no hay campos vacíos hoy) y los **20** hoy en
  `multifuero` quedan en `multifuero_sin_detalle`.
- **SC-007**: El 100% de las 277 Unidades Funcionales migradas tiene sus
  asignaciones de jueces resueltas: **2 UF** quedan con **cero asignaciones**
  (organismos administrativos, sin jueces por diseño) y las **275 restantes** con
  **una o más asignaciones** cada una (exclusivas, pools completos o subconjuntos, en
  cualquier combinación).
- **SC-008**: Existe un log de reconciliación con conteo de origen, conteo de
  destino y resultado por cada entidad, y con la fecha de la corrida.
- **SC-009**: La fuente Firestore permanece accesible en modo solo lectura después
  de la migración (respaldo verificable disponible).
- **SC-010**: El 100% de las divergencias de tipo/forma confirmadas por la
  verificación del 2026-09-07 tiene una decisión de canonicalización aplicada y
  registrada antes de la carga: el único `actualizado_a` en string ISO se parsea a
  Timestamp, y los valores de texto de `anio_implementacion` reportados por V3.7
  (fechas, descripciones y valores sin sentido) se convierten a año entero o `null`
  según D7. Los campos que la verificación confirmó ya uniformes (rol, coordenadas,
  `cantidad_jueces`, `jueces_asistidos`) no requieren acción.

## Assumptions

- **Fueros individuales (confirmado por verificación fechada).** La verificación
  `docs/resultado-verificacion-fueros-20260907.md` (corrida 2026-09-07) confirma
  que hoy en producción `fuero_simplificado` toma **exactamente cinco valores**
  sobre 116 organismos: penal (41), civil (31), multifuero (20), laboral (13) y
  familia (11) — total 116, con **0 documentos sin el campo**. No hay comercial,
  contencioso administrativo, penal juvenil ni ningún otro fuero cargado hoy. El
  catálogo de fueros individuales, por tanto, se deriva de los cuatro fueros
  presentes (penal, civil, familia, laboral), quedando "multifuero" como valor
  **calculado** y no como fuero individual. Si la carga posterior con referentes
  revela fueros adicionales, el catálogo se amplía sin cambiar la estructura de la
  relación.
- **Estados de migración de fueros (confirmado por verificación fechada).** La
  misma verificación reporta **0 documentos sin `fuero_simplificado`**: ningún
  organismo queda hoy sin valor. En consecuencia, el estado `sin_fueros_asignados`
  **no tiene casos en la carga inicial**; se mantiene en el modelo únicamente para
  altas futuras, no para la migración actual. El estado `multifuero_sin_detalle`
  cubre **20 organismos reales confirmados** (no una estimación): los que hoy
  declaran `multifuero` sin el detalle de qué fueros asisten.
- **Taxonomía 1:1 (confirmado por verificación fechada).** La verificación V0.3 /
  V7.2 del 2026-09-07 confirmó una única evaluación taxonómica por organismo sin
  excepciones (0 organismos con más de un documento, 0 documentos con id distinto de
  `v1`). Ya no es un supuesto pendiente: el modelado 1:1 (FR-022) queda cerrado.
- **Identidad de usuario (D4, confirmado por verificación fechada).** La
  verificación V1.1 del 2026-09-07 encontró **0 colisiones de email por casing** (46
  de 46 ids son emails en minúscula que coinciden con el campo `email`). En `users`
  no hay nada que limpiar. La decisión de usar un id subrogado en lugar del email
  como clave primaria se sostiene por **diseño hacia adelante** (Principio V, soporte
  de múltiples métodos de autenticación), no por un problema en los datos actuales.
- **`legacy_id` (confirmado por verificación fechada).** V2.11 confirmó que
  `legacy_id` es siempre string numérico o `null` (8 nulls de 116), sin
  inconsistencias de tipo. Se modela como columna nullable; su tipo concreto (entero
  o texto) se decide en `/speckit-plan`.
- **Estado real de los datos (verificación ya corrida).** Las verificaciones de
  `docs/verificacion-datos-firestore.md` se corrieron el 2026-09-07 y sus resultados
  están en `docs/resultado-verificacion-general-20260907.md` y
  `docs/resultado-verificacion-fueros-20260907.md`. Esta spec ya incorpora esos
  números reales (conteos, tipos canónicos, 0 referencias rotas) en vez de supuestos
  (Principio VII). Los tipos de columna concretos siguen difiriéndose a
  `/speckit-plan`.
- **Código muerto no se modela.** Los artefactos identificados como huérfanos,
  duplicados o inconsistentes en la auditoría §7.2/§7.3 (p. ej. la función
  huérfana de importación de taxonomía y sus mapeos divergentes) no se toman como
  requisito del modelo salvo decisión explícita (Principio XI).
- **Autenticación fuera de alcance aquí.** El modelo prevé soportar múltiples
  métodos de autenticación (Principio III) al usar id subrogado + email único,
  pero el detalle de credenciales, tokens y vinculación de métodos corresponde a
  la feature de backend/autenticación, no a esta.

## Fuera de alcance

Esta feature **NO** incluye (son features o fases posteriores):

- Diseño del backend, de la API o de la lógica de autorización server-side
  (Principios II y VI): esta spec define qué datos se guardan y sus relaciones,
  no cómo se accede ni cómo se autoriza.
- Diseño del frontend o de la experiencia de usuario.
- Diseño de la capa de reporting y del reemplazo del pipeline hacia BigQuery /
  Looker Studio (decisión D2 abierta).
- Elección de motor de base de datos, tipos de columna, índices, claves generadas,
  particionamiento, o cualquier decisión de stack de implementación: corresponde a
  `/speckit-plan`.
- Reconstrucción y versionado de las Firestore Security Rules (Principio VI): el
  modelo guarda los datos de rol y propiedad que la autorización necesitará, pero
  el enforcement es responsabilidad del backend.
- La carga real de los fueros de cada organismo con los referentes provinciales
  (gestión posterior a la migración; esta feature solo garantiza estructura y
  preservación del estado actual).

## Dependencias

- **Verificación de datos (satisfecha el 2026-09-07).** El prerrequisito de correr
  `docs/verificacion-datos-firestore.md` y registrar sus resultados fechados ya se
  cumplió: ver `docs/resultado-verificacion-general-20260907.md` y
  `docs/resultado-verificacion-fueros-20260907.md`. Cubren V0.2, V0.3, V1.1, V2.13,
  V3.3, V3.9, V3.10, V3.11 y la taxonomía (V4.x). Quedan pendientes de una corrida
  complementaria, si el plan las necesita, V4.6/V4.7 (formas divergentes de
  taxonomía), V6.6 (localidades huérfanas) y V4.8, señaladas como de bajo impacto en
  el resultado general.
- **Acceso administrativo a Firestore.** Necesario para leer los datos de origen y
  para mantener la fuente en modo solo lectura como respaldo (FR-033), sin
  hardcodear rutas de credenciales (Principio XIII).
- **Decisiones cerradas D3, D4, D7 y D8** de `docs/decisiones-pendientes.md`, ya
  incorporadas a esta spec. D8 reemplaza el tercer estado `no_aplica` de D6 por la
  tabla puente de asignaciones UF↔grupos de jueces.
