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
  usuario con id subrogado).
- `docs/verificacion-datos-firestore.md` — verificaciones sobre los datos reales
  que condicionan nulidad, tipos canónicos y limpieza de referencias (Principio
  VII de la constitución).
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
sueltas se conviertan en relaciones con integridad garantizada, y que las
referencias rotas se resuelvan antes de cargar los datos, para que una referencia
inválida deje de degradar silenciosamente y pase a ser imposible por diseño.

**Why this priority**: depende de que el modelo (US1) y los datos (US2) existan.
Hoy una referencia rota muestra el id crudo o `'(pool)'` sin cantidad; en el
modelo nuevo esa fila no debe poder existir (Principio VIII).

**Independent Test**: se puede validar verificando que, en el destino, no existe
ninguna referencia que apunte a un registro inexistente en ninguna de las
relaciones del modelo, y que las referencias rotas detectadas en la verificación
tienen una decisión de resolución registrada (limpieza o mapeo) aplicada antes de
la carga.

**Acceptance Scenarios**:

1. **Given** una unidad funcional con `localidad_id` que no existe en
   `localidades` (detectada por la verificación V3.9), **When** corre la
   migración, **Then** esa referencia se resuelve (se corrige o se mapea) antes de
   la carga y no se carga ningún registro huérfano.
2. **Given** un organismo cuyo propietario o cuyos editores referencian a un
   usuario que no existe (V1.10 / V2.13), **When** corre la migración, **Then** la
   referencia se resuelve antes de la carga.
3. **Given** el conjunto de datos migrado, **When** se recorren todas las
   relaciones del modelo, **Then** cero referencias apuntan a registros
   inexistentes.

---

### User Story 4 - Identidad de usuario con id subrogado (Priority: P2)

Como sistema que soportará múltiples métodos de autenticación, necesito que cada
usuario se identifique por un id interno subrogado (no por su email), con el email
como atributo único, y que las referencias de propiedad y edición de organismos
apunten a ese id, para que un mismo usuario resuelva a un único registro sin
importar cómo probó su identidad.

**Why this priority**: es la decisión D4 cerrada y el Principio V (identidad
unificada). Habilita que backend y autenticación (features posteriores) se
construyan sin volver a modelar la identidad.

**Independent Test**: se puede validar verificando que toda referencia de
propiedad (`usuario_google`) y edición (`editores[]`) del modelo migrado apunta al
id subrogado de un usuario existente, no a un email, y que no hay dos usuarios
activos con el mismo email tras la normalización de casing.

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
4. **Given** dos entradas de usuario con el mismo email en distinto casing
   (colisión detectada por V1.1), **When** se migra, **Then** se resuelven a una
   única identidad según la decisión de normalización registrada, y el email queda
   único en el destino.

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

- **Referencias rotas.** `localidad_id` o `pool_jueces_id` que apuntan a
  registros inexistentes (V3.9, V3.10); propietario/editores que apuntan a
  usuarios inexistentes (V1.10, V2.13). Deben resolverse antes de la carga.
- **Exclusividad de jueces en UF.** Una unidad funcional declara jueces por
  cantidad directa **o** por pool, nunca ambos ni ninguno. La migración debe
  detectar y resolver las que violen la exclusividad (V3.3).
- **Roles con forma inconsistente.** `rol` aparece a veces como array y a veces
  como string u otro tipo (V1.6); valores fuera del catálogo esperado (V1.7).
- **Colisión de email por casing.** Dos usuarios con el mismo email en distinto
  casing (V1.1, V7.1) deben resolverse a una única identidad.
- **Marca temporal con forma dual.** `actualizado_a` conviven Timestamp, string y
  ausente (V2.9): la migración debe canonicalizar a una sola forma.
- **Taxonomía con forma o valores inesperados.** Valores no-string (V4.6),
  estructura doble-anidada `{ v1: {...} }` dentro del propio doc `v1` (V4.7),
  grupos ausentes o vacíos (V4.5), códigos fuera de catálogo (V4.3).
- **Versionado de taxonomía nunca usado.** El sistema actual asume un único
  documento `v1`; hay que confirmar (V0.3, V7.2) que no existen versiones
  distintas antes de modelar la taxonomía como 1:1 por organismo.
- **Campos "obligatorios" ausentes en datos legados.** Organismos sin alguno de
  los campos que el alta nueva exige (V2.1); UF con campos de completitud vacíos
  (V3.4); documentos de usuario con solo `{email, rol, provincia}` (V1.5).
- **Denominación simplificada legada.** Organismos con valores del catálogo
  anterior de 39 en vez del catálogo actual de 10 (V2.4).
- **Editores con ruido.** Emails duplicados dentro de un mismo array o con casing
  mixto (V2.10, V7.6).
- **Localidades duplicadas.** Misma `nombre` + `provincia` en más de un registro
  (V5.2): UF distintas podrían referir a "la misma" localidad con ids diferentes.
- **Valores numéricos guardados como texto.** `jueces_asistidos` y
  `anio_implementacion` guardados como texto libre no siempre convertible (V3.6,
  V3.7); `cantidad_jueces` o `latitud`/`longitud` eventualmente como string (V6.4,
  V5.4).
- **Colecciones no contempladas.** Colecciones o subcolecciones que el código no
  toca pero existen en el proyecto (V0.2): deben inventariarse antes de declarar
  el modelo completo.

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
  haber dos usuarios activos con el mismo email tras la normalización de casing
  acordada (V1.1 / V7.1).
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
  (opcional) y marca temporal de última actualización.
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
  responsable, código postal).
- **FR-016**: El modelo MUST declarar la relación Unidad Funcional → Localidad
  como relación con integridad referencial garantizada (reemplaza `localidad_id`
  suelto).
- **FR-017**: El modelo MUST declarar la relación Unidad Funcional → Pool de
  Jueces como relación opcional con integridad referencial garantizada (reemplaza
  `pool_jueces_id` suelto).
- **FR-018**: El modelo MUST representar la asistencia de jueces de una Unidad
  Funcional como mutuamente excluyente: cantidad directa **o** referencia a un
  pool, nunca ambas ni ninguna. La migración MUST resolver las UF que hoy violen
  esta exclusividad (V3.3).
- **FR-019**: El modelo MUST representar la Localidad con sus atributos actuales
  (nombre, provincia, latitud, longitud).
- **FR-020**: El modelo MUST representar el Pool de Jueces con sus atributos
  actuales (descripción, cantidad de jueces, provincia).

**Taxonomía**

- **FR-021**: El modelo MUST representar la evaluación taxonómica de un organismo
  con las nueve dimensiones actuales agrupadas en gestión, institucional,
  organización e implementación, cada una con su valor del catálogo de códigos
  correspondiente.
- **FR-022**: El modelo MUST modelar la evaluación taxonómica como una relación de
  a lo sumo una evaluación por organismo (1:1), salvo que la verificación (V0.3 /
  V7.2) demuestre que existen múltiples versiones por organismo, en cuyo caso la
  decisión de modelado MUST registrarse explícitamente.
- **FR-023**: La migración MUST canonicalizar las formas divergentes de la
  taxonomía detectadas en la verificación (forma doble-anidada, valores no-string,
  grupos ausentes o vacíos, códigos fuera de catálogo) a la forma única del
  modelo.

**Catálogos / vocabularios controlados**

- **FR-024**: El modelo MUST tratar como vocabularios controlados los conjuntos de
  valores hoy definidos por catálogo: denominación simplificada (10 valores), tipo
  de oficina (4), provincia (24), tipo de UF (`Delegación` / `Subdelegación` /
  `Área Específica`), fueros individuales y códigos de taxonomía. (La forma de
  materializarlos —tabla de referencia o enumeración— NO se decide en esta spec.)

**Integridad referencial y limpieza (Principio VIII)**

- **FR-025**: El modelo MUST declarar como relaciones con integridad garantizada
  todas las que hoy son referencias sueltas: UF→localidad, UF→pool,
  organismo→propietario, organismo↔editores, organismo↔fueros.
- **FR-026**: Toda referencia rota detectada por las verificaciones (V1.10, V2.13,
  V3.9, V3.10) MUST resolverse (limpieza o mapeo) **antes** de la carga; no se
  cargan registros huérfanos.

**Canonicalización de datos divergentes (Principio VII)**

- **FR-027**: La migración MUST canonicalizar a una única forma los campos que hoy
  conviven con formas o tipos inconsistentes: marca temporal de actualización
  (Timestamp / string / ausente), rol (array / string), y los valores numéricos
  guardados como texto (`jueces_asistidos`, `anio_implementacion`,
  `cantidad_jueces`, `latitud`/`longitud`).
- **FR-028**: Las decisiones de nulidad, tipo canónico y tratamiento de cada
  divergencia (limpiar, mapear o aceptar variabilidad) MUST tomarse a partir de
  los resultados fechados de `docs/verificacion-datos-firestore.md`, no de los
  supuestos del código (Principio VII). Esta spec no fija esos tipos; los deja
  condicionados a la verificación y a `/speckit-plan`.
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
  Atributos de contacto y ubicación. Pertenece a un Organismo, referencia una
  Localidad, y declara jueces por cantidad directa **o** por Pool de Jueces (nunca
  ambos).
- **Localidad**: localidad geográfica (nombre, provincia, latitud, longitud).
  Referenciada por Unidades Funcionales.
- **Pool de Jueces**: agrupación de jueces con una cantidad (descripción, cantidad
  de jueces, provincia). Referenciado opcionalmente por Unidades Funcionales.
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
  inexistentes en cualquier relación del modelo.
- **SC-004**: El 100% de las relaciones de propiedad y edición de organismos
  apunta al id subrogado de un usuario existente; 0 referencias por email.
- **SC-005**: Tras la normalización de casing, existen 0 usuarios activos con
  email duplicado.
- **SC-006**: Para el 100% de los organismos (116 según la verificación del
  2026-09-07), `fuero_simplificado` es determinable a partir de su listado de
  fueros o de uno de los dos estados de migración; **0 organismos** quedan en
  `sin_fueros_asignados` (no hay campos vacíos hoy) y los **20** hoy en
  `multifuero` quedan en `multifuero_sin_detalle`.
- **SC-007**: El 100% de las Unidades Funcionales migradas cumple la exclusividad
  jueces-directos / pool (0 UF con ambos o ninguno tras la migración).
- **SC-008**: Existe un log de reconciliación con conteo de origen, conteo de
  destino y resultado por cada entidad, y con la fecha de la corrida.
- **SC-009**: La fuente Firestore permanece accesible en modo solo lectura después
  de la migración (respaldo verificable disponible).
- **SC-010**: El 100% de las divergencias de tipo/forma listadas en la
  verificación (marca temporal dual, rol array/string, numéricos como texto,
  formas de taxonomía) tiene una decisión de canonicalización aplicada y
  registrada antes de la carga.

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
- **Taxonomía 1:1.** Se asume una única evaluación taxonómica por organismo (el
  versionado `v1` del sistema actual nunca se materializó en más de una versión).
  La verificación V0.3 / V7.2 debe confirmarlo antes de cerrar el modelo; si
  aparecen versiones múltiples, la decisión se revisa y se registra (FR-022).
- **Normalización de email.** Se asume que las colisiones de email por casing
  (V1.1) se resuelven normalizando a minúscula, coherente con cómo el sistema
  actual da de alta usuarios; el detalle exacto se confirma con la verificación.
- **Estado real de los datos.** Esta spec describe el modelo objetivo y las reglas
  de migración; los valores concretos de nulidad, tipos canónicos y volumen de
  referencias rotas dependen de correr las verificaciones de
  `docs/verificacion-datos-firestore.md` y registrar sus resultados fechados
  (Principio VII). La spec deja esas decisiones condicionadas, no las prefija.
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

- **Verificación de datos.** Ejecutar `docs/verificacion-datos-firestore.md` y
  registrar sus resultados fechados es prerrequisito para cerrar las decisiones de
  nulidad, tipos canónicos e integridad referencial (FR-026, FR-028; Principio
  VII). En particular V0.2, V0.3, V1.1, V2.13, V3.3, V3.9, V3.10, V4.6/V4.7 y toda
  la sección V7.
- **Acceso administrativo a Firestore.** Necesario para leer los datos de origen y
  para mantener la fuente en modo solo lectura como respaldo (FR-033), sin
  hardcodear rutas de credenciales (Principio XIII).
- **Decisiones cerradas D3 y D4** de `docs/decisiones-pendientes.md`, ya
  incorporadas a esta spec.
