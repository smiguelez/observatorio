# Verificación de datos reales en Firestore

> **Propósito.** El Documento 1 (`docs/auditoria-app-actual.md`) describe la estructura que el
> **código asume**. Firestore no tiene esquema, así que los datos reales pueden haber divergido.
> Este documento es una **lista de verificaciones a ejecutar contra los datos reales** antes de
> diseñar el modelo relacional de PostgreSQL.
>
> **Importante:** no tengo acceso a los datos. Acá **no hay resultados**, solo las preguntas a
> responder y cómo obtenerlas. Los resultados hay que llenarlos al correr las consultas.
>
> **Cómo ejecutar.** Todas las verificaciones se pueden correr con el Firebase Admin SDK (Node),
> reutilizando el patrón de los scripts de inspección ya existentes en `scripts/`
> (`inspeccionar-*.cjs`). Varias ya están **parcialmente cubiertas** por esos scripts; se indica
> cuál en cada caso. Alternativas: consola de Firestore (para spot-checks) o exportar a BigQuery y
> consultar con SQL (si el export existe; ver §4 del Documento 1).
>
> **Convención de cada bloque:**
> - **Conteos de estructura** — confirmar que los datos cumplen lo que el código asume.
> - **Campos posiblemente ausentes** — en documentos viejos.
> - **Tipos posiblemente inconsistentes** — entre documentos.
> - **Relaciones posiblemente rotas** — IDs que apuntan a documentos inexistentes.

---

## 0. Verificaciones globales previas

- **V0.1 — Volumen por colección.** Contar documentos en `users`, `organismos`, `localidades`,
  `pools_jueces`, y el total de subdocumentos en `organismos/*/unidades_funcionales` y
  `organismos/*/taxonomia`. (El `SPEC.md` menciona ~114-116 organismos y ~260 UF a mediados de 2026;
  confirmar el número actual.)
- **V0.2 — ¿Existen colecciones o subcolecciones que el código NO toca?** Listar todas las
  colecciones raíz del proyecto (Firestore Console o `listCollections()` del Admin SDK) y compararlas
  con las 4 conocidas. Puede haber colecciones legadas o alimentadas solo por el pipeline de BigQuery.
- **V0.3 — ¿Hay más de un documento en cada subcolección `taxonomia`?** El código asume un único doc
  `v1`. Contar, por organismo, cuántos documentos tiene `taxonomia` y si alguno tiene id ≠ `v1`.

---

## 1. Colección `users` (id del documento = email)

### Conteos de estructura
- **V1.1** — ¿Todos los ids de documento son emails válidos y en minúscula? El código da de alta con
  `email.trim().toLowerCase()` (`GestionUsuariosForm.jsx:87`) y busca por email tal cual
  (`App.jsx:31` usa `user.email` de Google, que puede diferir en casing). Contar ids que no matcheen
  un patrón de email y los que tengan mayúsculas.
- **V1.2** — Para cada documento: ¿el campo `email` coincide con el id del documento? Contar
  discrepancias.

### Campos posiblemente ausentes (documentos viejos o creados por admin)
- **V1.3** — Contar documentos **sin** `rol`. (El chequeo de admin `App.jsx:49` y las Rules
  dependen de `rol`.)
- **V1.4** — Contar documentos **sin** `provincia`. (Bloquea el alta de organismos a no-admins,
  `CrearOrganismoForm.jsx:97`.)
- **V1.5** — Contar documentos que tienen **solo** `{email, rol, provincia}` (creados por el admin,
  `GestionUsuariosForm.jsx:110`) vs. los que además tienen `displayName`/`photoURL`/`createdAt`/…
  (creados en login, `App.jsx:101`). Cuantifica las dos "formas" del documento descritas en el
  Documento 1 §2.1.

### Tipos posiblemente inconsistentes
- **V1.6** — ¿`rol` es siempre un array? Contar documentos donde `rol` sea string, null u otro tipo.
  (Un `rol` string rompería la semántica de `App.jsx:49`.)
- **V1.7** — ¿Qué valores distintos aparecen en `rol`? Confirmar que son solo `usuario_normal` y
  `admin` (`GestionUsuariosForm.jsx:9`). Listar cualquier otro valor.
- **V1.8** — ¿`provincia` (cuando existe) usa exactamente la ortografía del catálogo
  `provinciaOptions` (`organismoOptions.js:33-58`)? Listar valores que no estén en la lista de 24.
- **V1.9** — ¿Cuántos usuarios tienen `rol` que incluye `admin`? (Sanity check de cuántos admins hay.)

### Relaciones posiblemente rotas
- **V1.10** — Emails presentes en `organismos.usuario_google` o en `organismos.editores[]` que **no**
  existan como documento en `users`. (Ver también V2.10/V2.11.)

---

## 2. Colección `organismos` (id autogenerado)

### Conteos de estructura
- **V2.1** — Contar organismos que tengan los 5 campos "obligatorios" del alta:
  `denominacion`, `denominacion_simplificada`, `tipo_oficina`, `provincia`, `fuero_simplificado`.
  Reportar cuántos tienen alguno vacío o ausente. (El alta nueva los exige, pero los datos legados
  pueden no cumplirlo.)
- **V2.2** — Distribución de `tipo_oficina` (valores distintos + conteo + casing).
  *Ya cubierto por `scripts/inspeccionar-tipo-oficina.cjs`.* Confirmar que casi todo está en
  minúscula y cuántos caen fuera del catálogo de 4 (`organismoOptions.js:19-24`). Clave porque
  `tipo_oficina` decide si se exige taxonomía (`GestionOrganismosForm.jsx:53`).
- **V2.3** — Distribución de `fuero_simplificado`. *Ya cubierto por
  `scripts/inspeccionar-fuero-simplificado.cjs`.* Confirmar la distribución (el `SPEC.md` §4 reportó
  al 2026-07-23: penal 40, civil 26, multifuero 14, laboral 12, familia 11, vacío 10, `PENAL` 1).
  Reconfirmar y detectar cuántos siguen en `multifuero`/vacíos (aún no modelados).
- **V2.4** — Distribución de `denominacion_simplificada`: cuántos usan el catálogo nuevo de 10
  (`organismoOptions.js:6-17`) y cuántos conservan valores del listado anterior de 39 (mencionado en
  `organismoOptions.js:4-5`). Estos últimos aparecen en la UI como "valor existente no listado"
  (`OrganismoForm.jsx:61-65`).
- **V2.5** — Inventario completo de nombres de campo presentes en la colección.
  *Ya cubierto por `scripts/inspeccionar-campos-organismos.cjs`.* Sirve para detectar campos legados
  que el código actual no lee (candidatos a descartar) o campos esperados que faltan.

### Campos posiblemente ausentes
- **V2.6** — Contar organismos **sin** `editores`. (La migración `agregar-campo-editores.cjs` debía
  cubrir todos; confirmar que no quedó ninguno sin el campo, porque `ListaOrganismosForm.jsx:36`
  hace `array-contains` sobre `editores`.)
- **V2.7** — Contar organismos **sin** `usuario_google`. (Sin owner, no aparecen en "Mis Organismos"
  de nadie salvo que estén en `editores`.)
- **V2.8** — Contar organismos **sin** `actualizado_a`, y **sin** `legacy_id`.

### Tipos posiblemente inconsistentes
- **V2.9** — ¿`actualizado_a` es siempre Timestamp? Contar cuántos son Timestamp vs. string vs.
  ausente. (`OrganismoForm.jsx:23-33` maneja ambos, lo que sugiere que conviven — confirmar.)
- **V2.10** — ¿`editores` es siempre array? Contar los que sean string/null/otro. ¿Hay emails
  duplicados dentro de un mismo array, o con casing mixto?
- **V2.11** — ¿`legacy_id` es string o null consistentemente, o hay números? (Los scripts de
  importación matchean por igualdad exacta de string, `importarTaxonomiaDesdeCSV.js:88`.)

### Relaciones posiblemente rotas
- **V2.12** — `provincia` de cada organismo vs. `localidades`: para cada valor distinto de
  `organismos.provincia`, ¿existen localidades con esa provincia (mismo casing)? *Ya cubierto por
  `scripts/inspeccionar-provincia-localidades.cjs`.* Detecta provincias de organismos sin ninguna
  localidad cargada (rompe el `<select>` de localidad en `UnidadFuncionalForm`, filtrado por
  provincia en `ListaUnidadesFuncionalesForm.jsx:42`).
- **V2.13** — `usuario_google` y `editores[]` que no existan en `users` (mismo chequeo que V1.10,
  desde el lado de `organismos`).

---

## 3. Subcolección `organismos/{id}/unidades_funcionales`

> Recorrer requiere iterar organismo por organismo (patrón de
> `scripts/completar-tipo-uf-vacio.cjs` y `scripts/inspeccionar-taxonomia-no-strings.cjs`).

### Conteos de estructura
- **V3.1** — Total de UF y distribución de cuántas UF tiene cada organismo. Cuántos organismos tienen
  **0 UF** (se reportan como incompletos, `GestionOrganismosForm.jsx:49`).
- **V3.2** — Distribución de `tipo_uf` (valores + casing). Confirmar que son `Delegación` /
  `Subdelegación` / `Área Específica` (`UnidadFuncionalForm.jsx:387-389`) y cuántos quedaron vacíos
  pese a la migración `completar-tipo-uf-vacio.cjs`. Ojo: `Área Específica` se agregó tarde (commit
  reciente), así que UF viejas pueden no tenerla o tener otros valores.
- **V3.3** — Cuántas UF usan modo "cantidad directa" (`jueces_asistidos` poblado, `pool_jueces_id`
  null) vs. modo "pool" (`pool_jueces_id` poblado, `jueces_asistidos` null). Detectar las que violen
  la exclusividad: **ambos** poblados o **ninguno**.

### Campos posiblemente ausentes
- **V3.4** — Por cada uno de los campos que `evaluarUF` considera obligatorios
  (`denominacion_unidad`, `localidad_id`, `tipo_uf`, `domicilio`, `codigo_postal`, `telefono`,
  `mail`, `responsable`, `jueces_asistidos`, `anio_implementacion` —
  `GestionOrganismosForm.jsx:8-12`): contar en cuántas UF está vacío/ausente. Da el mapa de
  completitud real.
- **V3.5** — Cuántas UF **no tienen** el campo `pool_jueces_id` en absoluto (UF creadas antes de la
  feature de pools, `SPEC.md` §6). El código lee `uf.pool_jueces_id` asumiendo `undefined`⇒modo
  cantidad (`juecesHelpers.js:2`); confirmar que ausencia y `null` se comportan igual.

### Tipos posiblemente inconsistentes
- **V3.6** — ¿`jueces_asistidos` es numérico, string numérico, o texto no convertible? Contar los que
  `Number(x)` daría `NaN` con valor no vacío (`GestionOrganismosForm.jsx:38` los marca incompletos).
  ¿Hay strings con espacios, comas, o texto ("varios", "2 jueces")?
- **V3.7** — ¿`anio_implementacion` es número, string de 4 dígitos, o texto libre? Listar valores que
  no parezcan un año (rango razonable), ya que se guarda como texto libre
  (`UnidadFuncionalForm.jsx:262-268`).
- **V3.8** — ¿`codigo_postal`, `telefono`, `mail` tienen formatos consistentes? (No es obligatorio
  para el rediseño, pero conviene saber la variabilidad antes de tipar columnas.)

### Relaciones posiblemente rotas
- **V3.9** — `localidad_id` que no exista en `localidades`. Contar y listar los organismos/UF
  afectados. (La UI muestra el id crudo o `'—'`, `GestionOrganismosForm.jsx:96-99`.)
- **V3.10** — `pool_jueces_id` (cuando no es null) que no exista en `pools_jueces`. Contar. (La UI
  muestra `'(pool)'` sin cantidad, `juecesHelpers.js:3`.)
- **V3.11** — Coherencia de provincia entre la UF y su pool: para UF en modo pool, ¿la `provincia`
  del `pools_jueces` referenciado coincide con la `provincia` del organismo padre? (El form filtra
  pools por provincia, `UnidadFuncionalForm.jsx:91`; un mismatch indicaría datos cargados antes de
  ese filtro o editados a mano.)

---

## 4. Subcolección `organismos/{id}/taxonomia` (documento `v1`)

### Conteos de estructura
- **V4.1** — Cuántos organismos tienen documento `taxonomia/v1` y cuántos no. *Ya cubierto
  parcialmente por `scripts/inspeccionar-taxonomia-no-strings.cjs`* (reporta `totalSinTaxonomia`).
- **V4.2** — Entre los que exigen taxonomía (`tipo_oficina` ∈ {`oficina judicial`,
  `oficina judicial especializada`}, `GestionOrganismosForm.jsx:26`): cuántos tienen los **9 campos**
  anidados completos vs. incompletos. Este es el conteo de completitud de taxonomía real.
- **V4.3** — ¿Los valores de los 9 campos están dentro de los códigos válidos del catálogo
  (`taxonomiaOptions.js`)? Ojo con las divergencias detectadas en el Documento 1 §7.2:
  ¿aparece algún código `F` (que produciría el `importarTaxonomiaDesdeCSV.js` huérfano para
  `presencia_territorial`) que la UI no ofrece? Listar valores fuera de catálogo por campo.

### Campos posiblemente ausentes
- **V4.4** — Por cada uno de los 9 campos (`gestion.autonomia`,
  `institucional.insercion_institucional`, `institucional.jerarquia_normativa`,
  `organizacion.dependencia`, `organizacion.asistencia_jurisdiccional`,
  `implementacion.alcance_proceso`, `implementacion.alcance_fuero`,
  `implementacion.presencia_territorial`, `implementacion.grado_implementacion`): contar cuántos docs
  `v1` lo tienen ausente. Detecta taxonomías parciales.
- **V4.5** — ¿Existen documentos `v1` con los grupos anidados pero **vacíos** (`{}`), o con el grupo
  ausente entero (p. ej. sin `implementacion`)? El lector usa `?.` (`GestionOrganismosForm.jsx:58`),
  pero conviene saberlo para el modelo relacional.

### Tipos posiblemente inconsistentes
- **V4.6** — Valores no-string en cualquiera de los 9 campos (número, boolean, array, Timestamp,
  objeto). *Cubierto exactamente por `scripts/inspeccionar-taxonomia-no-strings.cjs`.* Es crítico:
  un valor no-string rompe `tieneDatosTaxonomia` (`OrganismoDetailTabs.jsx:29`).
- **V4.7** — ¿Hay documentos donde la taxonomía esté guardada con una **forma distinta** a la
  esperada? P. ej. envuelta como `{ v1: {...} }` dentro del propio doc `v1` (doble anidado), o los
  grupos en el doc en vez de los campos. Ver la "forma dual" del Documento 1 §2.4.

### Relaciones
- **V4.8** — (Consistencia interna, no FK) Cruzar V4.2 con V3.1: ¿hay organismos marcados como
  "completos" por taxonomía pero con 0 UF, o viceversa? Ayuda a validar la regla de completitud del
  `SPEC.md` §1.2 contra los datos.

---

## 5. Colección `localidades` (id autogenerado)

### Conteos de estructura
- **V5.1** — Total de localidades y distribución por `provincia`. Cruzar con las 24 de
  `provinciaOptions`: ¿qué provincias no tienen ninguna localidad? (El `SPEC.md` §5.3 menciona que
  faltaban La Rioja, Misiones y Santa Cruz — reconfirmar.)
- **V5.2** — ¿Hay localidades duplicadas (mismo `nombre` + `provincia` en más de un documento)?
  Como el `localidad_id` de las UF apunta a un doc puntual, un duplicado significa que UF distintas
  pueden referirse a "la misma" localidad con ids diferentes.

### Campos posiblemente ausentes / tipos
- **V5.3** — Contar localidades sin `nombre` o sin `provincia`.
- **V5.4** — ¿`latitud`/`longitud` son siempre `number`? Contar los que sean string o estén
  ausentes. (No se usan en la app pero probablemente sí en el dashboard externo; ver Documento 1 §2.5.)
- **V5.5** — ¿`provincia` en `localidades` usa la misma ortografía que `organismos.provincia` y que
  `provinciaOptions`? (Base del join de V2.12 / V3.9.)

### Relaciones
- **V5.6** — Localidades **huérfanas**: cuántas no están referenciadas por ninguna UF
  (`localidad_id`). No es un error, pero informa el volumen real usado vs. cargado.

---

## 6. Colección `pools_jueces` (id autogenerado)

### Conteos de estructura
- **V6.1** — Total de pools y distribución por `provincia`.
- **V6.2** — ¿Cuántos pools están efectivamente referenciados por al menos una UF vs. huérfanos?
  (Un pool huérfano puede ser basura de pruebas o de UF borradas.)

### Campos posiblemente ausentes / tipos
- **V6.3** — Contar pools sin `descripcion`, sin `provincia`, o sin `cantidad_jueces`.
- **V6.4** — ¿`cantidad_jueces` es siempre `number`? El form castea con `Number(...)`
  (`UnidadFuncionalForm.jsx:136`), pero pools creados por otra vía podrían tener string. Contar.
- **V6.5** — ¿`provincia` usa la ortografía del catálogo? (Relevante para el filtrado por provincia y
  para las Rules de `pools_jueces` que comparan contra `users.provincia`, `SPEC.md` §6.3.)

### Relaciones
- **V6.6** — (Ver V3.10/V3.11) `pool_jueces_id` de UF apuntando a pools inexistentes, y coherencia de
  provincia UF↔pool↔organismo.

---

## 7. Verificaciones de cara al modelo relacional

Preguntas que exceden una colección pero conviene responder antes de diseñar el esquema:

- **V7.1 — Claves naturales vs. subrogadas.** `users` usa el email como PK (id = email);
  `organismos`, `localidades`, `pools_jueces` usan ids autogenerados. Decidir si en Postgres el email
  sigue siendo PK de usuarios o pasa a ser un `unique` con `id` serial. Verificar antes: ¿hay algún
  email repetido con distinto casing en `users` que colisionaría bajo `citext`/`lower()` único? (V1.1)
- **V7.2 — Cardinalidad organismo↔taxonomía.** El código asume 1:1 (siempre `v1`). Confirmar con V0.3
  y V4.7 que no hay organismos con múltiples versiones de taxonomía antes de modelarlo como columnas
  o tabla 1:1.
- **V7.3 — `fuero_simplificado` como enum vs. multivalor.** Con V2.3: si `multifuero` y vacíos siguen
  siendo ~20-25% de los datos, el modelo relacional debe decidir entre enum simple + valor especial
  `multifuero`, o una tabla puente organismo↔fuero (la dirección que `SPEC.md` §4.2 dejó pendiente).
- **V7.4 — `jueces_asistidos` string vs. int + pool.** Con V3.3/V3.6: definir el tipo de la columna
  (¿`integer` nullable + FK a pool?) y qué hacer con los strings no numéricos existentes.
- **V7.5 — Integridad referencial que hoy no existe.** Todas las relaciones (`localidad_id`,
  `pool_jueces_id`, `usuario_google`, `editores[]`) son referencias sueltas sin FK. Los conteos de
  V2.13, V3.9, V3.10 y V1.10 dan el volumen de referencias rotas que habrá que **limpiar o mapear**
  antes de aplicar `FOREIGN KEY` en Postgres.
- **V7.6 — `editores[]` (array embebido) → tabla puente.** Con V2.10: confirmar volumen y limpieza
  (duplicados, casing) antes de normalizar a una tabla `organismo_editor(organismo_id, email)`.

---

## 8. Nota sobre ejecución

- Los scripts `scripts/inspeccionar-*.cjs` ya resuelven, total o parcialmente: **V2.2** (tipo_oficina),
  **V2.3** (fuero_simplificado), **V2.5** (campos de organismos), **V2.12** (provincia↔localidades),
  **V4.1/V4.6** (taxonomía no-string). El resto requiere scripts nuevos siguiendo el mismo patrón
  (Admin SDK + service account), o consultas SQL si el export a BigQuery está disponible.
- Ninguna de estas verificaciones modifica datos: todas son de **solo lectura**. Mantener ese
  criterio (los scripts de inspección existentes lo declaran explícitamente en su encabezado).
- Al llenar resultados, registrar **fecha** de la corrida: los datos de producción cambian, y el
  `SPEC.md` muestra que relevamientos previos (p. ej. la distribución de fueros del 2026-07-23)
  quedaron desactualizados.
