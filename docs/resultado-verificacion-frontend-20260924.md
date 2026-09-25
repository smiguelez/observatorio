# Resultado de verificación — frontend (`005-frontend-cliente`)

> **Datos reales en la evidencia (revisado antes de commitear).** Las pantallas de usuarios, de completitud de
> organismos y de pools se ven contra la base real y mostraban emails, nombres, denominaciones de organismos y
> descripciones de pools reales. Las tres capturas (`admin-usuarios.png`, `admin-organismos.png`,
> `pool-en-uso.png`) se **regeneraron** con `tests/e2e/evidencia-visual.spec.ts`, que reemplaza esos valores por
> sintéticos ("usuario-N@ejemplo.test", "Organismo de ejemplo N", "Pool de ejemplo N") en la respuesta que
> recibe el navegador antes de dibujar; conservan estructura y cantidades reales, ningún dato identificable
> (las pruebas que comparan contra SQL no anonimizan y ya no escriben capturas). Las demás capturas solo
> muestran fixtures `test-frontend-*` y el catálogo de taxonomía (contenido de referencia, sin datos de
> entidades ni de personas). Los fixtures de pruebas unitarias también se sanearon. No se conserva ningún PDF.

Registro por historia, con evidencia real. Entorno: backend real (Fastify + Better
Auth 1.7.5) en `:3000` con `BETTER_AUTH_URL=http://localhost:5173`, frontend Vite
en `:5173` (proxy `/api`), base local `observatorio` (47 usuarios / 117 organismos
reales, que no se tocan; los fixtures son `test-frontend-*` y se borran al final de
cada corrida). Navegador: Chromium headless vía Playwright.
Cookies: ver `docs/resultado-verificacion-frontend-cookies-20260924.md` (T010).

## US1 — Login por los tres métodos (T022–T030)

Corrida: `npx playwright test login` → **6 passed** (15.1 s); `npx vitest run` →
**32 passed** (4 archivos); `tsc -b --noEmit` limpio. Evidencia:
`docs/evidencia-frontend/login-evidencia.json` y
`docs/evidencia-frontend/login-mensaje-generico.png`.

| Método | Qué se probó | Alcance real |
|---|---|---|
| Contraseña | Login desde la UI contra el backend real → `/organismos`; `returnTo` respetado (`/organismos/5?x=1`) | **De punta a punta** |
| Enlace por email | Pedido desde la UI; el link se toma del **log del backend** (el envío es un placeholder, G4); consumido en el navegador → sesión creada (`GET /api/auth/session` → 200, usuario nuevo `1179`); el mismo link reusado → `/login?error=INVALID_TOKEN` con mensaje "El enlace es inválido o venció" | **De punta a punta**, salvo el correo (no existe) |
| Google | El botón llama a `signIn.social`, el backend devuelve la URL de Google, el navegador navega a `accounts.google.com` con `redirect_uri=http://localhost:5173/api/auth/callback/google` | **NO de punta a punta.** El backend corrió con credenciales de relleno (`GOOGLE_CLIENT_ID=dummy-dev`); no hay credencial ni cuenta de Google de desarrollo en este equipo. Se verificó hasta la redirección (interceptada); el callback y la creación de sesión **quedan sin probar**. **T030 queda PENDIENTE por falta de acceso real** (no hay credencial de Google de desarrollo, confirmado por el responsable); no se simula ni se da por buena con un dummy. |

### Mensaje de error idéntico (FR-002, SC-008)

Tres causas distintas, contra el backend real, con el mismo formulario:

| Causa | Cómo se produjo | Respuesta del backend | Texto en pantalla |
|---|---|---|---|
| Contraseña incorrecta | usuario válido, clave equivocada | `401 INVALID_EMAIL_OR_PASSWORD` | "Email o contraseña incorrectos. También podés ingresar con Google o con un enlace por email. Recibir un enlace por email" |
| Cuenta inexistente | email que no existe | `401 INVALID_EMAIL_OR_PASSWORD` | idéntico |
| Credencial invalidada | alta con contraseña sin verificar email → verificación por magic link (Better Auth borra la credencial); luego login con la contraseña **correcta** | `401 INVALID_EMAIL_OR_PASSWORD` | idéntico |

El test compara los tres textos con `toBe` (igualdad exacta). Observación útil:
**el propio backend ya responde igual en los tres casos** (mismo status, mismo
`code`, mismo `message`), así que el cliente no podría distinguirlos aunque
quisiera; el cliente además no lee ni el `code` ni el `message` — usa un texto
fijo. Además hay 5 pruebas unitarias con respuestas de servidor distintas
(incluido un rechazo tipo D14, un 500 y una excepción de red) que producen el
mismo DOM. No hay ningún enlace ni botón de registro (test unitario y E2E).
`/registro`, `/signup` y `/pools` dan 404 con sesión iniciada.

### Limpieza y estado de la base

Tras la corrida: `usuarios` = 47 (los reales), `test-%` = 0, `auth."user"` = 0
(los 47 usuarios migrados aún no tienen cuenta en `auth.*`).

### Observaciones (fuera de la spec)

- Los tabs se renombraron a "Con contraseña" / "Con enlace por email": con el
  texto "Contraseña" el panel del tab quedaba etiquetado igual que el campo de
  contraseña (ambigüedad para lectores de pantalla y para las pruebas).

## US2 — Lista de organismos y alta (T031–T040)

Corrida: `npx playwright test organismos` → **6 passed** (18.6 s); `vitest` → **45 passed**
(6 archivos); `tsc` limpio. Evidencia: `docs/evidencia-frontend/organismos-evidencia.json`.

| Escenario | Resultado real (backend real) |
|---|---|
| 7 Alta `usuario_normal` | Provincia prellenada ("Buenos Aires") y **deshabilitada**; sin campo de propietario; fuero "Sin fuero asignado" (solo lectura). Tras crear, al volver por el historial de la SPA la lista ya trae el organismo, con etiqueta "Propio", y hubo **0 navegaciones de documento** (sin recarga) |
| 8 Sin provincia | Alta bloqueada: "completar tu provincia", sin botón de crear |
| 9 Admin | Provincia editable en el alta; al editar, `provincia_id` 1 → 2 en la base |
| 9b `usuario_normal` | La provincia del organismo aparece deshabilitada en la edición |
| 10 Ajeno | `GET /api/organismos/:id` → **403**; pantalla "No autorizado"; la lista del otro usuario no lo incluye |
| 14 Protección B | Al cambiar tipo 1 → 3 con una respuesta cargada, aparece el diálogo con la pregunta que se perdería; con **Cancelar**, ni el tipo ni la respuesta cambian (verificado en SQL); al **confirmar**, el tipo pasa a 3 y las respuestas a 0 |

### Hallazgos del backend real (afectan contratos ya escritos)

1. **Todos los ids `bigint` llegan como string, no solo los de usuario**: `{"id":"742","propietario_id":"1186"}`,
   pools `{"id":"729"}`, y por lo tanto también UF, asignaciones y `localidades.id`. Los `smallint`
   (catálogos, `tipo_oficina_id`, `provincia_id`) llegan como number. `contracts/consumed-api.md`
   decía `id: number` para varios recursos; la capa de mapeo (`api/ids.ts`, `idWire`) ahora normaliza
   **cualquier** id a `number`. Un test unitario con la respuesta capturada lo cubre.
   El esquema zod detectó el problema por sí solo en `localidades` antes de llegar a una pantalla.
2. **`POST /unidades-funcionales` con una `localidadId` inexistente responde 500** (violación de FK sin
   capturar, `23503`), no 400. La UI solo ofrece localidades reales, así que no se dispara, pero es
   la misma clase de brecha que G6 (`007`).
3. Detalle de organismo (`SELECT *`) incluye campos que el cliente ignora (`legacy_id`, `firestore_id`).

## US3 — Formulario dinámico de taxonomía (T041–T049)

Corrida: `npx playwright test taxonomia` → **4 passed** (13.3 s); `vitest` → **73 passed**
(9 archivos); `tsc` limpio. Evidencia: `docs/evidencia-frontend/taxonomia-evidencia.json` y
`docs/evidencia-frontend/taxonomia-formulario.png` (captura del formulario real de 9 preguntas).

| Escenario | Resultado real |
|---|---|
| 11 Formulario | 9 preguntas renderizadas desde el catálogo real del tipo 1; las 3 respondidas de antemano vienen marcadas; se cambió una y se respondió una nueva; **la base quedó con 4 filas** (las 3 previas —una modificada— más la nueva): guardar **no borró** ninguna por omisión. Tras recargar, lo guardado vuelve precargado |
| 12 Tipo sin taxonomía (coordinación) | Mensaje "este tipo de organismo no tiene taxonomía"; sin formulario; los pedidos capturados incluyen `GET /api/taxonomia/preguntas?tipoOficinaId=3` y **no** `GET …/taxonomia` |
| 13 Error real | Con el tipo cambiado por debajo (deriva real), el `PUT` recibió un **400 real** del trigger de Protección A: `la pregunta 1 no aplica al tipo de organismo actual (tipo_oficina_id=3) del organismo 749 (Protección A)`; la UI lo muestra completo junto al formulario y la base queda con 0 respuestas (atómico) |
| 13b Resaltado | Con un rechazo que nombra la pregunta ("Pregunta(s) inexistente(s): <código>", **respuesta simulada** con mock de red) la pregunta se marca y las demás no |

### Hallazgos que afectan la spec (datos y backend reales)

1. **FR-008 (texto real de la pregunta) no es satisfacible con los datos actuales**: en `taxonomia_preguntas`,
   `texto` es **idéntico a `codigo`** en las 9 preguntas (`insercion_institucional`, `jerarquia_normativa`, …);
   el enunciado real no está cargado (las **opciones** sí tienen texto real). El cliente muestra una versión
   legible del código ("Insercion institucional") como contingencia —sin tildes, porque no se pueden inventar—.
   Arreglarlo es un cambio de datos/seed (backend), no de frontend.
2. **SC-003 no se puede verificar contra datos reales**: las 9 preguntas de la base son todas `opcion_unica`
   (`tiposEnLaBase: ["opcion_unica"]`); no existe ninguna múltiple, numérica ni de texto libre. Los 4 tipos
   se cubren con un **catálogo sintético** en pruebas de componente (radio / casillas / spinbutton / textarea,
   precarga, PUT completo, múltiple vacía = no es error). Es cobertura de comportamiento del cliente, no
   de datos reales.
3. **FR-009 (identificar la pregunta con el problema) solo se cumple en parte**: los mensajes de los triggers
   nombran la pregunta por su **id interno** ("la pregunta 1"), que el cliente no conoce; solo el caso
   "Pregunta(s) inexistente(s)" trae códigos. La UI muestra siempre el mensaje completo del servidor y
   resalta la pregunta cuando el mensaje la nombra; además la validación local (opciones del catálogo,
   catálogo filtrado por tipo) evita casi todos estos rechazos antes de enviar. Mejorarlo requiere que el
   backend devuelva `preguntaCodigo` en el error (`007`).

## US4 — Unidades funcionales y asignación de jueces (T050–T060)

Corrida: `npx playwright test unidades-asignaciones` → **8 passed** (30.9 s) contra el backend real;
`vitest` → **84 passed** (11 archivos); `tsc` limpio. Evidencia:
`docs/evidencia-frontend/uf-evidencia.json` y `docs/evidencia-frontend/pool-en-uso.png`.

| Qué se probó | Resultado real (base leída por SQL después de cada acción) |
|---|---|
| UF: alta, edición, listado | UF creada con la localidad de la provincia del organismo; edición de domicilio/responsable persistida; la lista la muestra |
| **Crear pools dentro del diálogo** | Pestaña "Pools de la provincia": se crearon `pool A` (10) y `pool B` (8) sin salir del diálogo; en la base con `provincia_id = 1` |
| Asignar | Pool A **completo** (la cantidad se propone sola = 10) + pool B **subconjunto** (3 de 8): coexisten → `pool A:10 \| pool B:3` (D8 casos 3/4/5) |
| Grupo exclusivo | Un paso: crea el pool "Grupo exclusivo de <UF>" (total 4) y la asignación 4 |
| Cantidad > total | Aviso "supera el total del pool", **no bloquea**: se guardó `pool C:5` sobre un pool de 2 |
| **400 real** | Con el pool D asignado por otra pestaña mientras el diálogo seguía abierto, el POST devolvió **400** y la pantalla muestra "Ya existe una asignación de esta unidad funcional a ese pool." |
| Editar y quitar | PATCH de cantidad 10 → 9 y DELETE reflejados en la base |
| Pools: editar y borrar libre | `total_jueces` 8 → 12; el pool sin asignaciones se eliminó |
| **Borrar un pool EN USO** | El backend respondió **`500`** con `code: "23503"` (`violates foreign key constraint "unidad_funcional_grupo_jueces_grupo_jueces_id_fkey"`) y la pantalla mostró: **"No se pudo eliminar el pool: puede estar asignado a otras unidades funcionales."** El pool siguió existiendo en la base |
| Permisos | Un editor de otra provincia ve "Solo podés gestionar pools de tu provincia" y no tiene botón de crear |

No hay ninguna ruta ni ítem de menú de pools: todo ocurre dentro del diálogo.

### Observaciones

- **Fuga de datos de prueba detectada y corregida**: el pool "Grupo exclusivo de test-frontend-uf 1" no
  empieza con el prefijo `test-frontend-` y quedó en la base real tras una corrida; `limpiarFixtures`
  ahora también borra `descripcion LIKE 'Grupo exclusivo de test-frontend-%'`. Estado final verificado:
  `grupos_jueces` = 262, `usuarios` = 47, `organismos` = 117 (los valores originales).
- La provincia 1 tiene ~40 pools reales: la pestaña de pools del diálogo es una lista larga (sin
  paginación ni búsqueda). Mejora de UX pendiente, no pedida por la spec.
- La misma clase de 500 sin capturar aparece con una `localidadId` inexistente (US2, hallazgo 2).

## US5 — Jerarquía de menús (T061–T067)

Corrida: `npx playwright test navegacion` → **6 passed** (29.6 s); suite E2E completa (login,
organismos, taxonomía, UF, navegación) → **30 passed** (1.7 min); `vitest` → **89 passed** (12 archivos);
`tsc` limpio. Evidencia: `docs/evidencia-frontend/nav-evidencia.json` y `nav-movil.png`.
(El spec del spike T010 se retiró: dependía de la página temporal que reemplazó el router; su evidencia
sigue en `docs/evidencia-frontend/spike-cookies.json` y el login real ya cubre la misma ruta.)

| Escenario | Resultado real |
|---|---|
| 18 Sin pools | Sidebar de usuario normal: grupos `Organismos`, `Reportes`; enlaces `Mis organismos`, `Tableros ↗`; **ningún** texto "pool" ni "regist"; sin grupo `Administración`. `/pools` con sesión → "Página no encontrada". Admin: grupos `Organismos`, `Reportes`, `Administración` (`Gestión de organismos`, `Usuarios`) |
| Perfil/ajustes separados | No están en el sidebar; el menú de usuario tiene exactamente `Perfil`, `Ajustes`, `Cerrar sesión` |
| 24 Clics | Medido en 5 pantallas distintas (lista, detalle, taxonomía, alta de UF, alta de organismo): **perfil = 2 clics, ajustes = 2, tableros = 1** (SC-005 pide ≤ 3) |
| Tableros | Enlace con `href` = la URL configurada, `target="_blank"`, `rel="noopener noreferrer"`; abre una pestaña nueva (el destino `datastudio.example.test` se interceptó: no es un tablero real) |
| Sin `VITE_DATASTUDIO_URL` | Verificado por prueba unitaria: el ítem no se muestra |
| Breadcrumbs | "Mis organismos › <nombre real del organismo> › Taxonomía" |
| Cerrar sesión | Vuelve a `/login` y `GET /api/auth/session` → 401 |
| Móvil (390 px) | El menú está cerrado por defecto y se abre como panel deslizable (`nav-movil.png`) |

### Defecto encontrado por las pruebas

El `SidebarInset` de shadcn ya renderiza un `<main>`; el layout anidaba otro `<main>` (HTML inválido,
dos landmarks `main`). Lo detectó una prueba que buscaba `role="main"`. Corregido: el contenido va en un
`<div data-testid="contenido">`.

Nota: la corrida E2E de navegación requiere que el dev server arranque con
`VITE_DATASTUDIO_URL=https://datastudio.example.test/reporte` (variable de build, pública).

## US6 — Perfil y métodos de acceso (T068–T073)

Corrida: `npx playwright test perfil` → **4 passed** (13.6 s) contra el backend real; `vitest` → **93 passed**
(13 archivos); `tsc` limpio. Evidencia: `docs/evidencia-frontend/perfil-evidencia.json` y
`perfil-sin-contrasena.png`.

| Escenario | Resultado real |
|---|---|
| 23a Editar datos | Nombre y provincia guardados (en la base: `Persona de Prueba/Córdoba`); la provincia **de la sesión cambia de inmediato**: al ir a "Nuevo organismo" sin recargar ni volver a entrar, la provincia prellenada ya es Córdoba |
| 23b Métodos | Cuenta con contraseña: Contraseña "activa", Google "no vinculado", Enlace por email "disponible" |
| 23c Cambio de contraseña | La contraseña actual errónea se rechaza ("La contraseña actual no es correcta"); con la correcta se actualiza; una confirmación distinta no llega al backend; luego, **la contraseña vieja falla y la nueva entra** |
| 23d Sin contraseña | Cuenta creada por enlace: **no aparece el formulario**, sino "Tu cuenta no usa contraseña…"; Contraseña figura "no configurada" |

No existe ninguna acción de "fijar contraseña" (diferido a `007`, G3).

Observación: "Enlace por email: disponible" se muestra siempre porque es un método del backend que no deja una
cuenta vinculada visible en `listAccounts()`; solo `credential` y `google` se leen de la cuenta.

## US7 — (admin) Completitud y exportación (T074–T080)

Corrida: `npx playwright test admin-organismos` → **4 passed** (22.5 s) contra el backend real y **los 117
organismos reales** (+4 fixtures); `vitest` → **106 passed** (16 archivos); `tsc` limpio. Evidencia:
`docs/evidencia-frontend/admin-organismos-evidencia.json` y `admin-organismos.png`. Todo es de solo lectura
sobre los organismos reales.

| Qué se probó | Resultado real |
|---|---|
| **Cada fila contra la base** | Se calculó el mismo criterio por SQL para los **121** organismos (UF ≥ 1 y taxonomía completa) y se comparó con lo que muestra la pantalla: **0 discrepancias**. Resumen en pantalla: "117 de 121 organismos completos" = 117 según SQL |
| Fixtures | `completo` → completo; `sin-uf` → incompleto por unidades; `sin-taxonomia` → incompleto por taxonomía; **`coordinacion` (tipo 3, 0 respuestas) → completo**, con la nota "sin preguntas aplicables" (decisión 7) |
| Progreso | La barra de progreso es visible durante la evaluación |
| Costo real | **341 requests** de API y **~4,6 s** en total para 121 organismos; el catálogo de taxonomía se pide una vez por tipo |
| Concurrencia | Máximo en vuelo de la evaluación medido en la aplicación: **6** (los 6 `GET /api/organismos/<id>` simultáneos). Los eventos de red de Playwright informan 7 porque incluyen el refetch en segundo plano de la lista y llegan con desfase |
| Filtros | Todos / Completos / Incompletos aíslan los estados correctos y suman el total |
| PDF | Se descarga `completitud-organismos-2026-09-24.pdf` (146 KB, 6 páginas, empieza con `%PDF-`); contiene el mismo resumen ("117 de 121 organismos completos") y los nombres de los fixtures. No se conservó el archivo en el repo: incluye la lista de los organismos reales |
| No-admin | `/admin/organismos` muestra lo mismo que una ruta inexistente y no dispara la evaluación |

### Aclaración: 121 vs. 117 organismos, y re-corrida sobre los 117 reales

Los **121** de la corrida principal eran los **117 reales + 4 fixtures** que esa misma prueba crea en su
`beforeAll` (`completo`, `sin-uf`, `coordinacion`, `sin-taxonomia`) y borra en el `afterAll`; el "117" del
resumen del quickstart es el estado **posterior** a la limpieza. Ambos lados usaron el mismo universo: la
prueba comparaba `filas en pantalla == SELECT count(*) FROM organismos` (121 en ese momento) y la consulta
SQL de verdad recorría `FROM organismos` completo, es decir esos mismos 121. No hubo mezcla de 117 con 121.
Pero de esa corrida salían dos números que **no eran directamente los de los reales**: "117 de 121
completos" incluía 2 fixtures completos, y "115 reales completos" era una **resta**, no una medición.

Para no depender de esa inferencia se re-corrió la evaluación **sin crear ningún organismo de prueba** (solo
un usuario admin), con la base en su estado final (`docs/evidencia-frontend/admin-organismos-reales.json`,
`admin-organismos-reales.spec.ts`): **117 organismos en la base, 0 de fixtures, 117 filas en pantalla, ningún
id solo en la pantalla ni solo en SQL, 0 discrepancias**; resumen en pantalla **"115 de 117 organismos
completos"** = 115 según SQL. Los 2 incompletos son los organismos 242 y 266. La resta anterior quedó
confirmada por medición.

### Defectos encontrados y corregidos al medir

1. **Doble cola en desarrollo**: el doble montaje de StrictMode arrancaba **dos** evaluaciones a la vez
   (hasta 13 requests en vuelo). Se difiere el arranque un tick: ahora una sola cola.
2. **Request inútil en cada pantalla**: el breadcrumb llamaba `GET /api/organismos/0` cuando la ruta no era
   de un organismo. `useOrganismo` ahora no pide nada si no hay id (`enabled`).
3. El breadcrumb mostraba "Administración › Mis organismos" en `/admin/organismos`; ahora "Gestión de organismos".

### Hallazgo de datos

De los 117 organismos reales, 115 están completos por este criterio y 2 no (117 completos en pantalla menos los 2
fixtures completos). Verificado por SQL: `taxonomia_pregunta_tipos_oficina` solo cubre los tipos 1 y 2 (9
preguntas cada uno); los organismos de tipo 3 (14) y 4 (13) —**27 de 117**— nunca tienen taxonomía aplicable y
cuentan como completos en ese aspecto (decisión 7).

## US8 — (propietario/admin) Editores (T081–T083)

Corrida: `npx playwright test editores` → **5 passed** (23.6 s) contra el backend real; `vitest` → 109 passed;
`tsc` limpio. Evidencia: `docs/evidencia-frontend/editores-evidencia.json` y `editores.png`.

| Escenario | Resultado real |
|---|---|
| 19a Agregar | Antes de agregarlo, el futuro editor recibe **403** al pedir el organismo. El propietario lo agrega desde la UI (los candidatos excluyen al propietario); en la base queda en `organismo_editores`; en **otra sesión de navegador** el editor ve el organismo en su lista con la etiqueta "Editor" y puede abrirlo |
| 19b Un editor no gestiona editores | En la UI ve la lista pero **no hay** botones de agregar ni de quitar y aparece "Solo el propietario o un administrador…". Saltándose la UI, el backend responde **`POST` → 403** y **`DELETE` → 403**; la base no cambia |
| 19c 400 real | Con la lista vieja abierta, otra parte agregó al mismo usuario; el `POST` desde la UI devolvió **400** y la pantalla muestra "Ese usuario ya es editor de este organismo." |
| 19d Quitar | Con el editor **logueado y sin re-login**, el propietario lo quita: en su siguiente pedido recibe **403** ("No autorizado") y su lista queda vacía (SC-007 de `002` visto desde el cliente) |
| 19e Admin | Un admin agrega y quita editores de un organismo **ajeno** |

### Detalles

- `usuarioId` llega como string y el `POST` lo exige numérico: la prueba unitaria fija que se envía como `number`.
- Un `DELETE` con `content-type: application/json` y cuerpo vacío lo rechaza Fastify con **400**; el cliente HTTP
  solo declara el tipo cuando hay cuerpo (el helper de las pruebas no lo hacía y dio un falso 400).

## US9 — (admin) Usuarios, solo lectura (T084–T085)

Corrida: `npx playwright test admin-usuarios` → **2 passed** (7.9 s) contra el backend real; `vitest` → 109
passed (17 archivos); `tsc` limpio. Evidencia: `docs/evidencia-frontend/usuarios-evidencia.json` y
`admin-usuarios.png`.

| Escenario | Resultado real |
|---|---|
| 21 Lista | **49 filas en pantalla = 49 usuarios en la base** (47 reales + 2 fixtures); email, provincia y roles de cada fila comparados contra SQL: **0 discrepancias**; 4 admins. Búsqueda por email filtra y al vaciar vuelve al total |
| 22 Cambio de rol | Los **49** botones "Cambiar rol de <email>" están **deshabilitados** (0 habilitados), con la explicación visible ("todavía no está disponible… requiere una función nueva del servidor"); un clic forzado sobre uno **no genera ningún pedido de escritura** (`escrituras: []`) |
| No-admin | `/admin/usuarios` muestra lo mismo que una ruta inexistente y **no se hizo ningún `GET /api/usuarios`** |

Con esto las 9 historias tienen su pantalla real; ya no queda ninguna pantalla provisoria en el router.

## Polish (T086–T091) y validación del quickstart

### Sesión vencida a mitad de formulario (T087, escenario 25) — `sesion-vencida.spec.ts`, 3 passed

| Caso | Resultado real |
|---|---|
| 25a Misma cuenta | Con un formulario a medias y la cookie borrada, "Guardar" recibe **401** y aparece el diálogo "Tu sesión venció" **sobre la misma pantalla**; el guardado fallido no cambió la base. Se vuelve a ingresar por contraseña en el diálogo: el campo **conserva lo escrito**, una marca puesta en `window` sigue ahí (**no hubo recarga**), y el segundo intento guarda (`PATCH` 401 → 200; la base tiene el texto nuevo) |
| 25b Otra cuenta | Si en el diálogo entra **otra** cuenta, la app se recarga (lista de esa cuenta, vacía) y el borrador de la primera **no se guarda** con la sesión de la segunda |
| 25c Google/enlace | Quien no usa contraseña va al login con `returnTo` y el diálogo le avisa que lo no guardado se pierde |

Defecto encontrado por la prueba: `signIn.email` con `callbackURL` hace que el **cliente de Better Auth navegue**
(recarga completa) a esa URL; el diálogo pasaba `callbackURL` y perdía el borrador. Se omite en ese flujo.

### Suite de contrato de la capa de mapeo (T086, escenario 26)

`scripts/grabar-fixtures.mjs` graba **19 respuestas reales** del backend (`tests/unit/api/fixtures/real/`; en
`/api/usuarios` se conserva la forma y se reemplazan email y nombre — no se guardan datos de usuarios reales).
`contrato.test.ts` → **43 casos**: camelCase uniforme (ninguna clave con `_`), todo id `number`, quitar cada
clave del wire lanza `ContratoInesperado` (salvo columnas internas `firestore_id`/`legacy_id`, ignoradas a
propósito), ids `"abc"` y fuera de rango rechazados, `roles: null` → `[]`. Al endurecerlo se vio que
`opciones` (catálogo y respuestas de taxonomía) era opcional en el esquema aunque el backend siempre la manda
en las preguntas de opción: ahora falta = `ContratoInesperado`.

### Accesibilidad y responsive (T088) — `accesibilidad.spec.ts`, 4 passed

axe-core (WCAG 2.0/2.1 A y AA) sobre **17 pantallas/estados**: login (escritorio y 390 px), lista, alta, detalle,
taxonomía, editores, UF (lista y formulario), perfil, ajustes, diálogo de asignación (2 pestañas), menú de
usuario abierto, admin (usuarios y completitud) y menú lateral móvil: **0 violaciones**. Antes de corregirlo dio
una `serious`: `aria-hidden-focus` con el menú de usuario abierto (Radix en modo modal deja el disparador
enfocable bajo `aria-hidden`); se usó `modal={false}`. Es una auditoría automática: detecta una parte de los
problemas de accesibilidad; no reemplaza una revisión con lector de pantalla.

### Estado de las verificaciones

| Comprobación | Resultado |
|---|---|
| `npm run typecheck` (`src/` **y** `tests/`) | limpio |
| `npm run lint` (oxlint) | 0 errores; solo avisos en archivos generados por shadcn (`components/ui`, `hooks/use-mobile`) |
| `npm run build` | ok |
| `npm test` (Vitest) | **152 passed** (18 archivos) |
| `npm run test:e2e` (Playwright, backend y base reales) | **52 passed** (3,9 min) |
| Base tras la corrida completa | `usuarios` 47, `test-%` 0, `organismos` 117, `grupos_jueces` 262, `auth."user"` 0 (valores originales) |

### Quickstart (`specs/005-frontend-cliente/quickstart.md`), escenario por escenario

| # | Escenario | Estado | Dónde |
|---|---|---|---|
| 0 | Spike de cookies | ✅ | sección T010 + `…-cookies-20260924.md` |
| 1 | Login por contraseña | ✅ | US1 |
| 2 | Login por Google | ⚠️ **PENDIENTE (T030)**: solo hasta la redirección a Google con el `redirect_uri` correcto; falta el callback con una cuenta real. Sin credencial de desarrollo | US1 |
| 3 | Magic link | ✅ (link tomado del log del backend: el envío de correo no existe) | US1 |
| 4 | Mensaje genérico | ✅ (3 causas reales, textos idénticos) | US1 |
| 5 | Sin sesión → login | ✅ | US1 |
| 6 | Sin registro | ✅ (`/registro`, `/signup`, `/pools` → 404) | US1, US5 |
| 7 | Alta `usuario_normal` | ✅ | US2 |
| 8 | Alta sin provincia | ✅ | US2 |
| 9 | Provincia editable (admin) | ✅ | US2 |
| 10 | Organismo ajeno → 403 | ✅ | US2 |
| 11 | Taxonomía dinámica | ✅ con datos reales (9 preguntas, todas de opción única); los otros 3 tipos **solo con catálogo sintético** | US3 |
| 12 | Taxonomía sin preguntas | ✅ | US3 |
| 13 | Error de taxonomía | ✅ 400 real; resaltado de la pregunta solo con mock (el mensaje real usa ids internos) | US3 |
| 14 | Protección B | ✅ | US2 |
| 15 | UF y asignaciones | ✅ | US4 |
| 16 | Pools dentro del diálogo | ✅ | US4 |
| 17 | Pool en uso (500) | ✅ **500 real** del backend (`23503`) y mensaje claro | US4 |
| 18 | Sin sección de pools | ✅ | US5 |
| 19 | Editores | ✅ | US8 |
| 20 | Completitud y PDF | ✅ (0 discrepancias contra SQL; el PDF no se conserva en el repo) | US7 |
| 21 | No-admin en `/admin/*` | ✅ | US7, US9 |
| 22 | Usuarios solo lectura | ✅ | US9 |
| 23 | Perfil | ✅ | US6 |
| 24 | Navegación ≤ 3 clics | ✅ (2 / 2 / 1) | US5 |
| 25 | Sesión vencida | ✅ | Polish |
| 26 | Mapeo D13 | ✅ | Polish |

**25 de 27 escenarios verificados; el 2 (Google) queda pendiente y el 11 con cobertura parcial de datos** (ver arriba).

### Lo que cambia para el backend / `007` (hallazgos de esta implementación)

1. `BETTER_AUTH_URL` obligatoria (ya documentada en `backend/README.md`).
2. `DELETE /api/pools-jueces/:id` con asignaciones → **500** (FK sin `ON DELETE`, ruta sin captura). Igual, `POST` de UF con
   `localidadId` inexistente → **500**. Ambos deberían ser `400` con mensaje, como hizo `006` con asignaciones.
3. Los errores de los triggers de taxonomía nombran la pregunta por **id interno**; para FR-009 el backend debería devolver `preguntaCodigo`.
4. **Datos**: `taxonomia_preguntas.texto` es igual a `codigo` en las 9 preguntas (falta cargar los enunciados); las 9 son de opción única.
5. Todo `bigint` se serializa como string (D13, ya registrado).
6. Sigue sin haber cambio de rol, fijar contraseña ni alta controlada de usuarios (D14).


## Success Criteria: veredicto por criterio (actualizado tras SC-002 y SC-007)

| SC | Veredicto |
|---|---|
| SC-001 | **No confirmable**: depende de T030 (Google sin credencial) y además no hay envío real de correo (G4) |
| SC-002 | **Confirmado en lo técnico** con un recorrido único (abajo); la parte de usabilidad humana no se mide con pruebas automáticas |
| SC-003 | Confirmado con los datos reales (9 de 9 de opción única); los otros 3 tipos solo con catálogo sintético |
| SC-004 | Confirmado en los casos probados (no es una prueba exhaustiva); `GET /api/usuarios` sigue abierto a cualquier autenticado por diseño del backend |
| SC-005 | Confirmado (2 / 2 / 1 clics en 5 pantallas de escritorio) |
| SC-006 | Confirmado (117 organismos reales, 0 discrepancias contra SQL) |
| SC-007 | **Confirmado para las pantallas comparadas** (abajo); no se comparó el 100% de las pantallas |
| SC-008 | Confirmado (3 causas reales y 6 simuladas, mismo texto) |
| SC-009 | Confirmado en lo funcional; la descubribilidad no se probó con personas |

### SC-002 — recorrido único con un usuario sin datos previos (`recorrido-sc002.spec.ts`, passed)

Usuario recién creado (sin provincia, sin organismos), **una sola sesión, sin recargar la página después de
entrar** (0 cargas de documento; el `reload` final es solo la verificación de persistencia):

1. Entra y ve la lista vacía. Pulsa "Nuevo organismo": la app **no** le muestra un formulario imposible, le
   explica que falta la provincia y el propio mensaje lo lleva al perfil.
2. Elige su provincia **una vez** (Córdoba) y guarda.
3. Vuelve a "Nuevo organismo": la provincia **ya viene puesta y bloqueada** (no se la vuelve a pedir). Completa
   denominación, denominación simplificada y tipo (`oficina judicial`) y crea el organismo.
4. Desde el detalle, un clic a "Taxonomía": el formulario **no vuelve a pedir ningún dato del organismo** (ni
   campos de texto ni combos) y muestra las **9** preguntas aplicables; responde las 9 y guarda.

Resultado: **13 acciones del usuario** (1 provincia + 3 datos del organismo + 9 preguntas; ninguna repetida),
**2,9 s** de reloj de la máquina desde que llega a la lista hasta "Respuestas guardadas"; en la base el
organismo queda con su nombre, provincia Córdoba y propietario correctos, y **9 respuestas** de taxonomía; tras
recargar, las 9 siguen marcadas (`docs/evidencia-frontend/sc002-evidencia.json`).

Límites de esta evidencia: es una prueba automatizada (el tiempo es de máquina, no de una persona; "sin volver a
preguntar cómo hacerlo" es un juicio de usabilidad que solo se puede medir con personas). El recorrido incluye
un desvío obligatorio (completar la provincia en el perfil) que la app explica pero que no es opcional.

**Hallazgo de diseño para decidir** (no lo cubre ningún SC): en la SPA vieja un usuario sin provincia veía
"Un administrador tiene que asignarte una provincia"; en la app nueva **el propio usuario elige su provincia en
el perfil**, porque `PATCH /api/usuarios/:id` lo permite (`002`, FR-016: el propio usuario o un admin). La
provincia de un organismo es "fija para `usuario_normal`" solo respecto de la del perfil, y esa la puede cambiar
él mismo. Si la intención era que solo un admin asigne la provincia, hoy no se cumple (ni en el backend ni en la
UI).

### SC-007 — comparación visual contra la SPA vieja (`comparacion-visual.spec.ts`, passed)

Cómo se hizo: se ejecutó el **código de `src/` sin modificar** con Firebase reemplazado por stubs en memoria
(`frontend/tests/visual/spa-vieja/`), ambas apps con los **mismos datos sintéticos** ("Organismo de ejemplo A/B/C")
y el mismo viewport (1280×720). Capturas lado a lado en `docs/evidencia-frontend/`:
`comparacion-menu-lista.png`, `comparacion-alta.png`, `comparacion-taxonomia.png`; métricas en
`comparacion-visual-metricas.json`.

Rasgos objetivos medidos en el DOM (SPA vieja → app nueva):

| Rasgo | SPA vieja | App nueva |
|---|---|---|
| Fuente | `ui-sans-serif` (sistema) | Geist Variable |
| Fondo / botón principal | gris claro `rgb(249,250,251)` / azul `rgb(37,99,235)` | blanco / negro `oklch(0.205 0 0)` |
| Barra lateral y migas de pan | no / no | sí / sí |
| Taxonomía: controles | **9 `<select>` nativos**, 22 tarjetas azules, 3 pestañas | **64 radios** (opción única), fieldsets, 4 pestañas (agrega Editores) |
| Primera pantalla tras entrar | menú de botones centrados | lista con navegación agrupada |

Métrica de diferencia: la diferencia cruda de píxeles dio solo **3,9–5,8 %** y **contradijo mi expectativa
inicial** (había fijado > 30 %): las dos pantallas son mayormente fondo claro y esa métrica queda artificialmente
baja aun siendo pantallas evidentemente distintas. Se reemplazó por la **similitud de "tinta"** (Jaccard: qué
parte del contenido dibujado está en el mismo lugar), con el umbral fijado **antes** de medir (una copia
superaría 0,8; se exige < 0,5), y con controles:

| Comparación | Jaccard |
|---|---|
| **vieja vs. nueva**: menú/lista · alta · taxonomía | **0,01 · 0,02 · 0,02** |
| la misma imagen contra sí misma (control positivo) | 1,00 |
| mismo diseño, otra pantalla — vieja: menú vs alta · alta vs taxonomía | 0,22 · 0,31 |
| mismo diseño, otra pantalla — nueva: lista vs alta · alta vs taxonomía | 0,17 · 0,13 |

Es decir, pantallas equivalentes de las dos apps se parecen **menos** entre sí que dos pantallas distintas de una
misma app. Es una medida de disposición del contenido, no un juicio sobre el "lenguaje de diseño"; por eso se
acompaña de las capturas y de los rasgos medidos arriba.

**Parecidos que sí hay (por diseño, no copia visual):** los mismos campos en el alta (denominación,
denominación simplificada, tipo, provincia), la misma agrupación de la taxonomía por dimensión con los mismos
textos de opciones (datos), pestañas "Unidades funcionales" y "Taxonomía", y el mismo enunciado legible sin
guiones bajos ("insercion institucional") porque ambos parten del mismo dato (D19). En el alta cambia a propósito
un rasgo funcional: el fuero pasa de select editable a solo lectura.

**Lo que NO cubre:** solo se compararon 3 pantallas (4 contando el menú). No se compararon el login (la SPA
vieja solo lo muestra sin sesión, con Google como único método), la lista/alta de UF, la gestión de organismos,
la asignación de editores ni la gestión de usuarios de la SPA vieja; perfil, ajustes y el diálogo de pools no
tienen contraparte. La SPA vieja se ejecutó con Firebase simulado; el código de interfaz es el original.

### Defectos y problemas encontrados en esta pasada

1. **Latente y real**: un `Select` de catálogo podía enviar el id `0` (`Number('')` cuando Radix llama a
   `onValueChange('')`), que el backend rechaza con **500** por la FK (misma familia que D16). Apareció al
   agregar `defaultValues` a los formularios y rompió la prueba de sesión vencida; se ignora el valor vacío y el
   esquema exige ids positivos. La causa exacta (Radix) es una hipótesis: el síntoma se reprodujo y desapareció
   con la guarda, pero no aislé la llamada.
2. Formularios que pasaban de campo no controlado a controlado (avisos de React) en datos del organismo, perfil y
   UF: ahora tienen `defaultValues`.
3. **Disco casi lleno del equipo** (`/` al 95 %, ~1,2 GB libres tras borrar ~1 GB de mis temporales): con el
   disco al 100 % el navegador falló al cargar módulos (`ERR_INSUFFICIENT_RESOURCES`) y dio fallos falsos en
   pruebas que antes pasaban. No era un defecto de la app; conviene liberar espacio (la SPA vieja instala ~500 MB
   de `node_modules` por corrida).

Suite tras estos cambios: Vitest 152 passed; Playwright **57 passed, 3 omitidos** (la comparación sin
`VIEJA_URL`); base sin fixtures (47 usuarios, 117 organismos, 262 pools).
