# Auditoría de la aplicación actual — Observatorio de Oficinas Judiciales (JUFEJUS)

> **Propósito.** Inventario de lo que la aplicación *es hoy*, como insumo para la reescritura
> (frontend/backend separados, PostgreSQL propio). No propone cambios ni mejoras: describe.
>
> **Método.** Lectura completa del código versionado (`git ls-files`: 46 archivos, ~3.034 líneas
> en `src/`) más los scripts de `scripts/` (que están en `.gitignore` pero presentes en disco) y el
> `SPEC.md` del repo. Cada afirmación sobre el código cita `archivo:línea`.
>
> **Convención de confianza.**
> - **[verificado]** — leído directamente en el código de este repo.
> - **[inferido]** — deducción razonable a partir del código, marcada como tal.
> - **[fuera del repo]** — no se puede determinar desde el repositorio; se indica qué haría falta.
>
> **Nota de seguridad.** No se reproduce ningún secreto. Los valores de `.env.local` y el archivo
> de credenciales de service account (`scripts/observatorio-d71a7-firebase-adminsdk-*.json`) se
> mencionan solo por su existencia y propósito.

---

## 0. Panorama general [verificado]

- **Tipo de app:** SPA de React 19 + Vite 6 (`package.json`, `vite.config.js`). Enrutado con
  `react-router-dom` v7 (`src/main.jsx:9`, `src/App.jsx:162`).
- **Arquitectura de datos:** el navegador habla **directamente** con Cloud Firestore mediante el
  SDK web de Firebase (`src/firebase.js`). **No hay backend propio, ni funciones serverless, ni
  API intermedia**: no existe carpeta `api/` ni `functions/`, y `vercel.json` solo contiene el
  rewrite de SPA (`vercel.json`). Toda la lógica de acceso a datos corre en el cliente.
- **Autenticación:** Firebase Authentication con Google Sign-In (`src/firebase.js:2`,
  `src/App.jsx:116-126`).
- **Autorización:** basada en un documento por usuario en la colección `users` (id = email) y un
  campo `rol` (array). El enforcement real es de las **Firestore Security Rules**, que **no están
  versionadas en el repo** (viven en Firebase Console; su contenido al 2026-07-27 está transcripto
  en `SPEC.md` §3.3 y §6.3). **[fuera del repo]**
- **Deploy:** Vercel (`SPEC.md` §2; `vercel.json`). **[verificado que el repo apunta a Vercel; el
  proyecto Vercel en sí es fuera del repo]**
- **Reporting:** un iframe embebido de Google Data Studio / Looker Studio (`src/components/ReportesPage.jsx:12`).
  La tubería Firestore→BigQuery→Data Studio **no está en el repo** (ver §4).

---

## 1. Superficie funcional (rutas y pantallas)

Todas las rutas están **dentro del guard de autenticación** de `src/App.jsx:143`
(`{user && isAuthorized ? (...) : (pantalla de login)}`). Un usuario no autenticado solo ve el
botón "Iniciar sesión con Google" (`src/App.jsx:174-186`).

**Modelo de acceso [verificado]:**
- *Autenticado y autorizado* = tiene sesión de Google **y** existe `users/{su-email}` en Firestore
  (`src/App.jsx:31-40`). Si el doc no existe, se cierra la sesión y se muestra un alert pidiendo
  acceso por correo (`src/App.jsx:34-39`).
- *Admin* = `users/{email}.rol` incluye `'admin'` (`src/App.jsx:49`).
- Las rutas admin-only **no se montan** si `isAdmin` es falso (`src/App.jsx:168-170`): un no-admin
  que navegue a `/gestion` no matchea ninguna ruta (pantalla en blanco dentro del layout), no ve un
  "403". El enforcement de datos igual lo dan las rules server-side. **[verificado el montaje
  condicional; el enforcement server-side es fuera del repo]**

| Ruta | Componente | Acceso | Qué hace (vista de usuario) | Lee | Escribe |
|---|---|---|---|---|---|
| `/` | `MenuPage` (`src/components/MenuPage.jsx`) | Autenticado | Menú de navegación con enlaces. Muestra opciones admin solo si `isAdmin` (`MenuPage.jsx:35-56`). | — | — |
| `/organismos` | `ListaOrganismosForm` (`src/components/ListaOrganismosForm.jsx`) | Autenticado | "Mis Organismos": tarjetas de los organismos donde el usuario es owner o editor. Al entrar a uno abre el detalle con pestañas (`OrganismoDetailTabs`). | `organismos` (por `usuario_google` y por `editores`), subcolección `unidades_funcionales` (conteo), subcolección `taxonomia` (`ListaOrganismosForm.jsx:34-95`) | Vía el detalle: `organismos`, `unidades_funcionales`, `taxonomia/v1` (ver `OrganismoDetailTabs`, `UnidadFuncionalForm`) |
| `/crear-organismo` | `CrearOrganismoForm` (`src/components/CrearOrganismoForm.jsx`) | Autenticado (admin y no-admin, con matices) | Alta de un organismo. Admin elige provincia libremente; no-admin queda fijado a su `provincia` de `users` y, si no la tiene, ve un mensaje bloqueante (`CrearOrganismoForm.jsx:97-108`). | `users/{email}` (provincia, `CrearOrganismoForm.jsx:36-37`) | `organismos` (addDoc, `CrearOrganismoForm.jsx:72-82`) |
| `/reportes` | `ReportesPage` (`src/components/ReportesPage.jsx`) | Autenticado | Muestra un dashboard de Data Studio embebido en un iframe. | — (contenido externo) | — |
| `/gestion` | `GestionOrganismosForm` (`src/components/GestionOrganismosForm.jsx`) | **Admin** (ruta montada solo si `isAdmin`, `App.jsx:168`) | Reporte de completitud de **todos** los organismos: resumen por usuario + detalle por provincia (acordeón) + exportación a PDF por provincia. | `organismos` (todos), `localidades`, `pools_jueces`, y por organismo `unidades_funcionales` + `taxonomia/v1` (`GestionOrganismosForm.jsx:200-221`) | — (solo lectura + genera PDF en el navegador) |
| `/asignar-editores` | `AsignarEditoresForm` (`src/components/AsignarEditoresForm.jsx`) | **Admin** (`App.jsx:169`) | Asignar/quitar editores (por email) a organismos, filtrando por provincia, con selección múltiple. | `organismos` (todos, `AsignarEditoresForm.jsx:40`) | `organismos.editores` vía `arrayUnion`/`arrayRemove` (`AsignarEditoresForm.jsx:100,117`) |
| `/gestion-usuarios` | `GestionUsuariosForm` (`src/components/GestionUsuariosForm.jsx`) | **Admin** (`App.jsx:170`) | Listar/editar usuarios (rol + provincia) y dar de alta usuarios nuevos. | `users` (todos, `GestionUsuariosForm.jsx:26`) | `users` (updateDoc `GestionUsuariosForm.jsx:62`; setDoc alta `GestionUsuariosForm.jsx:110`) |

**Efecto secundario en el login (no es una ruta):** al iniciar sesión, `copiarDatosDeGoogleAFirestore`
sincroniza datos del perfil de Google al doc `users/{email}` y garantiza el rol `usuario_normal`
(`src/App.jsx:66-113`).

### 1.1 Funcionalidad presente en el código pero NO alcanzable desde la navegación

- **Importación de taxonomía desde CSV** — `src/components/importarTaxonomiaDesdeCSV.js` exporta
  `importarTaxonomiaDesdeCSV(file)`, que parsea un CSV y escribe en `taxonomia/v1` de cada organismo
  buscándolos por `legacy_id`. **No se importa desde ningún componente** (grep sin resultados de
  import). Es código huérfano / no cableado a la UI. **[verificado]**
- **`Layout` (`src/components/layout.jsx`)** — componente de layout con header/logout. **No se
  importa en ningún lado** (grep sin resultados). El header real está inline en `App.jsx:145-159`.
  Código muerto. **[verificado]**
- **Componentes UI sin uso:** `Label` (`src/components/ui/label.jsx`) y `CardTitle`
  (exportado en `src/components/ui/card.jsx`) no se usan en ninguna pantalla. **[verificado]**

---

## 2. Modelo de datos según el código

Firestore **no tiene esquema**; lo que sigue es la estructura que el **código asume**. Las
divergencias posibles con los datos reales se listan en `docs/verificacion-datos-firestore.md`.

Colecciones que el código toca (nivel raíz):
`users`, `organismos`, `localidades`, `pools_jueces`.
Subcolecciones bajo `organismos/{id}`: `unidades_funcionales`, `taxonomia`.

### 2.1 `users` — id del documento = **email** del usuario

| Campo | Tipo aparente | Escrito por | Leído por |
|---|---|---|---|
| `displayName` | string | `App.jsx:89,102` (login) | — (solo se guarda) |
| `email` | string | `App.jsx:90,103`; `GestionUsuariosForm.jsx:111,112` | `GestionUsuariosForm.jsx:29,148` |
| `emailVerified` | boolean | `App.jsx:91,104` | — |
| `photoURL` | string | `App.jsx:92,105` | — |
| `createdAt` | string ISO (`new Date().toISOString()`) | `App.jsx:93,106` | — |
| `lastSignInTime` | string | `App.jsx:94,107` | — |
| `createdAtGoogle` | string | `App.jsx:95,108` | — |
| `rol` | array&lt;string&gt; (`'usuario_normal'`, `'admin'`) | `App.jsx:96,109`; `GestionUsuariosForm.jsx:63,112` | `App.jsx:46,49`; `GestionUsuariosForm.jsx:33`; **Rules** (fuera del repo) |
| `provincia` | string | `GestionUsuariosForm.jsx:64,113` | `CrearOrganismoForm.jsx:37`; `GestionUsuariosForm.jsx:33`; **Rules** `pools_jueces` (fuera del repo) |

**Estructura asumida que Firestore no garantiza [verificado]:**
- `App.jsx:46,49` asume `rol` es un array (`userData.rol.includes(...)`). Si un doc tuviera `rol`
  como string o ausente, `App.jsx:78` (`Array.isArray`) lo cubre en el login, pero el chequeo de
  admin de `App.jsx:49` (`userData.rol && userData.rol.includes('admin')`) fallaría silenciosamente
  con un string (un string tiene `.includes`) — inconsistencia latente.
- **Documentos de `users` creados por el admin** (alta en `GestionUsuariosForm.jsx:110-114`)
  guardan solo `{email, rol, provincia}` — **sin** `displayName`, `photoURL`, `createdAt`, etc. Esos
  campos recién se completan en el primer login del usuario (`App.jsx:101-110`). Es decir: dos
  "formas" del documento `users` coexisten según cómo se haya creado. **[verificado]**

### 2.2 `organismos` — id autogenerado por Firestore

| Campo | Tipo aparente | Escrito por | Leído por |
|---|---|---|---|
| `denominacion` | string | `CrearOrganismoForm.jsx:73`; `OrganismoDetailTabs.jsx:52` (vía `resto`) | múltiples (listados, reportes, PDF) |
| `denominacion_simplificada` | string (catálogo de 10, `organismoOptions.js:6-17`) | `CrearOrganismoForm.jsx:74`; `OrganismoDetailTabs`; script `importar_denominaciones.cjs:98` | `OrganismoForm.jsx:14-15` |
| `tipo_oficina` | string (catálogo de 4, `organismoOptions.js:19-24`) | `CrearOrganismoForm.jsx:75`; `OrganismoDetailTabs` | `ListaOrganismosForm.jsx:142`; `GestionOrganismosForm.jsx:53` (decide si exige taxonomía) |
| `provincia` | string (catálogo de 24, `organismoOptions.js:33-58`) | `CrearOrganismoForm.jsx:76` | agrupaciones por provincia; join con `localidades`/`pools_jueces` |
| `fuero_simplificado` | string (`penal`/`civil`/`familia`/`laboral`/`multifuero`, `organismoOptions.js:26`) | `CrearOrganismoForm.jsx:77`; `OrganismoDetailTabs` | `ListaOrganismosForm.jsx:147` (color de badge) |
| `usuario_google` | string = email del owner | `CrearOrganismoForm.jsx:78` | `ListaOrganismosForm.jsx:35`; reportes; **Rules** |
| `editores` | array&lt;string&gt; (emails) | `CrearOrganismoForm.jsx:79`; `AsignarEditoresForm.jsx:100,117`; script `agregar-campo-editores.cjs:70` | `ListaOrganismosForm.jsx:36`; `AsignarEditoresForm`; **Rules** |
| `legacy_id` | string \| null | `CrearOrganismoForm.jsx:80` (siempre `null` en altas nuevas) | `importarTaxonomiaDesdeCSV.js:88`; script `importar_denominaciones.cjs`; `OrganismoForm.jsx:136` |
| `actualizado_a` | Timestamp (`serverTimestamp()`) | `CrearOrganismoForm.jsx:81`; `OrganismoDetailTabs.jsx:54`; `UnidadFuncionalForm.jsx:192` | `OrganismoForm.jsx:23-33` (maneja tanto Timestamp como string) |
| `taxonomia` | **no es un campo real**: en memoria del cliente es un objeto embebido, pero se persiste como **subcolección** (ver 2.4) | — | — |

**Relaciones implícitas [verificado]:**
- `usuario_google` → id de doc en `users` (ambos son el email). Sin FK real.
- `editores[]` → emails que *deberían* existir en `users`, pero nada lo garantiza (se agregan por
  texto libre validado solo por regex, `AsignarEditoresForm.jsx:85`).
- `legacy_id` → identificador del sistema legado externo, usado para *matchear* organismos al
  importar taxonomía/denominaciones. No apunta a otra colección de Firestore.

**Estructura asumida que Firestore no garantiza:**
- `OrganismoForm.jsx:23-33` contempla explícitamente que `actualizado_a` sea Timestamp **o** string
  **o** ausente — evidencia de que en los datos reales conviven ambos tipos. **[verificado / inferido
  del defensivo del código]**
- Los colores de badge de `tipo_oficina` usan claves en MAYÚSCULAS
  (`ListaOrganismosForm.jsx:9-14`) mientras que el dato real está en minúsculas
  (documentado en `SPEC.md` §1.7 y §4): el lookup cae al gris por defecto. **[verificado —
  inconsistencia]**

### 2.3 `organismos/{id}/unidades_funcionales` — id autogenerado

Escrito en `UnidadFuncionalForm.jsx:147-166` (`payload = {...nuevaUF, jueces_asistidos, pool_jueces_id}`).

| Campo | Tipo aparente | Notas |
|---|---|---|
| `denominacion_unidad` | string | obligatorio en el form (`UnidadFuncionalForm.jsx:111`) |
| `localidad_id` | string = id de doc en `localidades` | obligatorio; **relación** → `localidades` |
| `tipo_uf` | string (`Delegación`/`Subdelegación`/`Área Específica`, `UnidadFuncionalForm.jsx:387-389`) | script `completar-tipo-uf-vacio.cjs` rellenó los vacíos con `"Delegación"` |
| `anio_implementacion` | string (input de texto libre) | evaluado como año pero **no** se castea a número |
| `domicilio` | string | |
| `telefono` | string | |
| `mail` | string | |
| `responsable` | string | |
| `codigo_postal` | string | |
| `jueces_asistidos` | string \| null | `null` cuando se usa pool; si no, string de input de texto. `evaluarUF` espera que sea convertible a número (`GestionOrganismosForm.jsx:38`) |
| `pool_jueces_id` | string \| null | `null` cuando se carga cantidad directa; si no, id de doc en `pools_jueces`. **Relación** → `pools_jueces` |

**Relaciones implícitas [verificado]:**
- `localidad_id` → `localidades/{id}`. Si el id no existe, la UI muestra el id crudo o `'—'`
  (`GestionOrganismosForm.jsx:96-99`, `ListaUnidadesFuncionalesForm.jsx:57-60`).
- `pool_jueces_id` → `pools_jueces/{id}`. Si no está en el mapa, `resolverJueces` muestra `'(pool)'`
  sin cantidad (`src/utils/juecesHelpers.js:1-4`).

**Modos mutuamente excluyentes [verificado]:** una UF declara jueces por `jueces_asistidos`
(número directo) **o** por `pool_jueces_id`, nunca ambos (`UnidadFuncionalForm.jsx:129-151`;
`SPEC.md` §6.1). El código setea el que no aplica en `null`.

### 2.4 `organismos/{id}/taxonomia` (documento `v1`)

Es una **subcolección** con (en la práctica) un único documento de id `v1`.

Estructura del doc `v1` (valores = códigos de una letra `"A"`..`"F"`, ver `taxonomiaOptions.js`):
```
{
  gestion:        { autonomia },
  institucional:  { insercion_institucional, jerarquia_normativa },
  organizacion:   { dependencia, asistencia_jurisdiccional },
  implementacion: { alcance_proceso, alcance_fuero, presencia_territorial, grado_implementacion }
}
```

Escrito por:
- `OrganismoDetailTabs.jsx:58-61`: `setDoc(taxonomia/v1, taxonomia.v1, { merge: true })` — solo si
  hay datos útiles (`tieneDatosTaxonomia`).
- `importarTaxonomiaDesdeCSV.js:119`: `setDoc(taxRef, data)` **sin `merge`** (pisa el doc completo).
  *Función huérfana, ver §1.1.*

Leído por:
- `GestionOrganismosForm.jsx:220`: `getDoc(organismos/{id}/taxonomia/v1)` → lee los grupos al nivel
  raíz del doc (`taxonomia[grupo][campo]`, `GestionOrganismosForm.jsx:58`).
- `ListaOrganismosForm.jsx:81-87`: `getDocs` sobre la subcolección `taxonomia`, arma
  `taxonomia[docId] = data()` → resulta en `{ v1: {...grupos} }` en el estado del cliente.

**Inconsistencia de forma en memoria vs. persistencia [verificado]:** en el estado del cliente la
taxonomía se maneja envuelta en `{ v1: {...} }` (`OrganismoDetailTabs.jsx:10-22` `estructuraVacia`),
pero al persistir se guarda `taxonomia.v1` como *contenido* del documento `v1`
(`OrganismoDetailTabs.jsx:59-60`). `GestionOrganismosForm` lee el doc directo (sin `.v1`),
`ListaOrganismosForm` reconstruye el `.v1`. Funciona pero exige que cada lector sepa en qué "forma"
está — es una fuente de fragilidad para el rediseño.

**Estructura asumida que Firestore no garantiza [verificado]:**
- `tieneDatosTaxonomia` (`OrganismoDetailTabs.jsx:25-31`) asume que **todo valor es string**
  (llama `valor.trim()`). Un valor numérico/boolean/array rompería. El script de inspección
  `scripts/inspeccionar-taxonomia-no-strings.cjs` existe justamente para detectar ese caso —
  evidencia de que se sospecha divergencia real.
- `evaluarOrganismo` (`GestionOrganismosForm.jsx:57-59`) asume la anidación `taxonomia[grupo][campo]`;
  usa `?.` defensivo, así que degrada a "incompleto" en vez de romper.

### 2.5 `localidades` — id autogenerado

| Campo | Tipo aparente | Escrito por | Leído por |
|---|---|---|---|
| `nombre` | string | script `insertar-localidades-cordoba.cjs:44` | `GestionOrganismosForm.jsx:98`; `ListaUnidadesFuncionalesForm.jsx:43,59` |
| `provincia` | string | script | filtrado por provincia (`ListaUnidadesFuncionalesForm.jsx:42`) |
| `latitud` | number | script | — (no se usa en la app; presumiblemente para el mapa del dashboard externo) **[inferido]** |
| `longitud` | number | script | — |

**No hay escritura de `localidades` desde la UI** — solo por script manual. **[verificado]**

### 2.6 `pools_jueces` — id autogenerado

| Campo | Tipo aparente | Escrito por | Leído por |
|---|---|---|---|
| `descripcion` | string | `UnidadFuncionalForm.jsx:135` | `UnidadFuncionalForm.jsx:338` |
| `cantidad_jueces` | number (`Number(...)`, `UnidadFuncionalForm.jsx:136`) | `UnidadFuncionalForm.jsx:136` | `GestionOrganismosForm.jsx:210`; `ListaUnidadesFuncionalesForm.jsx:45` (mapa id→cantidad) |
| `provincia` | string | `UnidadFuncionalForm.jsx:137` | filtro por provincia (`UnidadFuncionalForm.jsx:91`) |

**Relación:** `unidades_funcionales.pool_jueces_id` → `pools_jueces/{id}`. **[verificado]**

---

## 3. Escrituras y lecturas (origen de cada operación)

### 3.1 Entrada de usuario (formularios en el navegador) [verificado]

| Operación | Archivo:línea | Colección/doc |
|---|---|---|
| Login → upsert de perfil | `App.jsx:101-110` (`setDoc merge`) | `users/{email}` |
| Alta de organismo | `CrearOrganismoForm.jsx:72-82` (`addDoc`) | `organismos` |
| Guardar detalle de organismo | `OrganismoDetailTabs.jsx:52-55` (`updateDoc`) | `organismos/{id}` |
| Guardar taxonomía | `OrganismoDetailTabs.jsx:59-60` (`setDoc merge`) | `organismos/{id}/taxonomia/v1` |
| Alta/edición de UF | `UnidadFuncionalForm.jsx:159,163` (`updateDoc`/`addDoc`) | `organismos/{id}/unidades_funcionales` |
| Borrado de UF | `ListaUnidadesFuncionalesForm.jsx:53` (`deleteDoc`) | `organismos/{id}/unidades_funcionales/{id}` |
| Crear pool inline | `UnidadFuncionalForm.jsx:134-138` (`addDoc`) | `pools_jueces` |
| Tocar `actualizado_a` del organismo tras guardar UF | `UnidadFuncionalForm.jsx:191-193` (`updateDoc`) | `organismos/{id}` |
| Asignar/quitar editores | `AsignarEditoresForm.jsx:100,117` (`arrayUnion`/`arrayRemove`) | `organismos/{id}` |
| Alta/edición de usuario | `GestionUsuariosForm.jsx:62,110` (`updateDoc`/`setDoc`) | `users/{email}` |

Todas estas operaciones corren **en el cliente** con el SDK web y las credenciales del usuario
logueado; la autorización la imponen las Security Rules (fuera del repo).

### 3.2 Proceso automático [verificado]

- **Único proceso automático dentro de la app:** el upsert de `users/{email}` en cada login
  (`App.jsx:66-113`). Se dispara en dos lugares (`handleLogin` → `verificarUsuario` en
  `App.jsx:121`, y el `useEffect` sobre `user` en `App.jsx:129-135`), lo que provoca ejecución doble
  al iniciar sesión. **[verificado]**
- **No hay jobs programados, ni Cloud Functions, ni cron dentro del repo.** **[verificado]**

### 3.3 Scripts manuales (Node + Firebase Admin SDK) [verificado]

Viven en `scripts/` (gitignored). Todos cargan el service account key local y usan `firestore()`.

**Que escriben:**
- `agregar-campo-editores.cjs` — agrega `editores: []` a organismos que no lo tengan (migración única; soporta `--dry-run`, `--id=`).
- `completar-tipo-uf-vacio.cjs` — setea `tipo_uf: "Delegación"` en UFs con el campo vacío (`--dry-run`, `--id=`).
- `importar_denominaciones.cjs` — matchea filas de `listado.xlsx` (por provincia + denominación normalizadas) y actualiza `denominacion_simplificada` (`--dry-run`). Emite `resultado_matching_denominaciones.json`.
- `insertar-localidades-cordoba.cjs` — inserta 8 localidades de Córdoba con lat/long (`--dry-run`).

**Solo lectura (inspección; no escriben):**
- `inspeccionar-campos-organismos.cjs` — lista campos y tipos de `organismos`.
- `inspeccionar-fuero-simplificado.cjs` — distribución de `fuero_simplificado`.
- `inspeccionar-tipo-oficina.cjs` — distribución de `tipo_oficina`.
- `inspeccionar-provincia-localidades.cjs` — cruza `organismos.provincia` vs `localidades.provincia`.
- `inspeccionar-taxonomia-no-strings.cjs` — detecta valores no-string en `taxonomia/v1`.

Estos scripts son directamente reutilizables como base para las verificaciones del Documento 2.

### 3.4 Función huérfana (no cableada) [verificado]

- `importarTaxonomiaDesdeCSV.js` — escribiría `taxonomia/v1` vía SDK web desde el navegador, pero
  ningún componente la importa (ver §1.1).

---

## 4. Capa de reporting

**Lo que está en el repo [verificado]:**
- `src/components/ReportesPage.jsx:9-18` embebe un iframe a
  `https://datastudio.google.com/embed/reporting/c3658d7d-bf21-44ca-a987-ab6868d7d6e7/page/p_4z6gkh1c6d`.
  Es un dashboard de Google Data Studio / Looker Studio (report id `c3658d7d-…`, página `p_4z6gkh1c6d`).
- `SPEC.md` §8 documenta que ese iframe apunta a "un dashboard de datos públicos propio".

**Lo que NO está en el repo [fuera del repo]:**
- **Cómo llegan los datos de Firestore a BigQuery.** No hay ningún código de exportación, ni uso de
  `@google-cloud/bigquery` (declarado en `package.json:13` pero **sin ningún import** en el
  repositorio — grep confirmado). Lo más probable (a confirmar) es una de estas opciones, todas
  configuradas fuera del repo:
  - la extensión oficial *"Stream Firestore to BigQuery"*, o
  - un export programado de Firestore + carga a BigQuery, o
  - una sincronización manual.
  **Para saberlo hay que mirar:** Firebase Console → Extensions; GCP Console → BigQuery (datasets/tablas),
  Cloud Scheduler, y los data sources del dashboard de Looker Studio.
- **Qué consultas o vistas existen en BigQuery** y **qué tablero consume cada una.** No determinable
  desde el repo. En Looker Studio, el propio dashboard (report id de arriba) declara sus data sources
  (tabla/vista de BigQuery). Hay que abrir el dashboard en modo edición o revisar el dataset de
  BigQuery.
- **`googleapis` (`package.json:17`)** también está declarado y **sin uso** en el repo — no se puede
  determinar para qué se pensó (¿Sheets? ¿Drive? ¿BigQuery API?). **[verificado que no se importa;
  el motivo es fuera del repo]**

En resumen: **la cadena de reporting Firestore→BigQuery→Data Studio existe pero es completamente
externa al repositorio.** Lo único versionado es el punto final (el iframe).

---

## 5. Dependencias de Google Cloud / Firebase

Para cada una: qué hace y qué implicaría reemplazarla fuera de GCP (descripción de la dependencia, **sin** proponer el reemplazo concreto).

1. **Firebase Authentication (Google Sign-In)** — `src/firebase.js:2,15-16`; `src/App.jsx:116-126`;
   `src/components/UserContext.jsx:12-13`.
   *Qué hace:* login federado con Google; provee `user.email`, `displayName`, `photoURL`,
   `metadata.lastSignInTime/creationTime`.
   *Qué haría falta para reemplazarla:* un proveedor de identidad OIDC/OAuth con Google y una capa que
   emita/valide sesiones; la app hoy usa el email como clave primaria de `users` y de ownership.
   (Nota: `SPEC.md` §2 dice que la intención es *mantener* Firebase Auth tras la migración.)

2. **Cloud Firestore** — `src/firebase.js:3,17`; todos los componentes de datos.
   *Qué hace:* base de datos de toda la app; acceso directo desde el cliente.
   *Qué haría falta:* una base relacional + una **API de backend** (hoy inexistente) que intermedie,
   ya que la app hoy consulta la DB directamente desde el navegador.

3. **Firestore Security Rules** — **no versionadas**; contenido en `SPEC.md` §3.3 y §6.3. **[fuera del repo]**
   *Qué hace:* es el **único** enforcement real de autorización (rol admin, owner/editor, acceso a
   `pools_jueces` por provincia, acceso a `users`/`localidades`). La UI solo esconde/oculta opciones.
   *Qué haría falta:* reimplementar toda esa lógica de autorización en el backend nuevo. **Riesgo
   alto de omisión** porque las reglas no están en el repo: hay que copiarlas de la consola antes de
   migrar.

4. **Configuración del proyecto Firebase (web config)** — `src/firebase.js:5-12` vía variables
   `VITE_*` (ver §6). *Qué hace:* identifica el proyecto/tenant. *Reemplazo:* config del nuevo backend/IdP.

5. **Firebase Admin SDK + service account key** — `scripts/*.cjs` (p. ej. `agregar-campo-editores.cjs:16-23`).
   *Qué hace:* acceso privilegiado a Firestore para migraciones/inspección desde Node.
   *Qué haría falta:* acceso administrativo equivalente a la nueva DB para migraciones.
   **Nota de seguridad:** el archivo de clave (`scripts/observatorio-d71a7-firebase-adminsdk-*.json`)
   está **en disco** dentro de `scripts/` (carpeta gitignored). Es un secreto activo; no se
   reproduce aquí. `importar_denominaciones.cjs:5` además hardcodea la ruta absoluta a ese archivo.

6. **BigQuery** — `@google-cloud/bigquery` en `package.json:13`, **sin uso en el repo**. La tubería
   de reporting es externa (ver §4). *Qué haría falta:* replicar el pipeline de datos hacia el
   sistema de análisis nuevo. **[fuera del repo]**

7. **Google Data Studio / Looker Studio** — `ReportesPage.jsx:12`. *Qué hace:* dashboard embebido.
   *Qué haría falta:* una herramienta de visualización equivalente y su fuente de datos. **[embed
   verificado; el dashboard es externo]**

8. **Vercel (hosting/deploy)** — `vercel.json`; `SPEC.md` §2. No es GCP, pero es la dependencia de
   despliegue actual. *Qué hace:* sirve la SPA estática con fallback de rutas a `index.html`.
   (No es GCP; se lista por completitud del contexto de despliegue.)

**Servicios GCP configurados pero NO usados en el código [verificado]:**
- **Cloud Storage:** `firebase.js:9` configura `storageBucket`, pero **no se importa `getStorage`**
  ni se sube/lee ningún archivo. La app no usa Storage.
- **Cloud Functions / Cloud Scheduler:** sin rastro en el repo.

---

## 6. Configuración y entorno

**Variables de entorno esperadas** (todas con prefijo `VITE_`, por lo que Vite las **embebe en el
bundle del cliente**; en apps web de Firebase esto es esperado y no son secretos server-side).
Definidas en `.env.local` (gitignored vía `*.local`) y consumidas en `src/firebase.js:6-11`:

| Variable | Propósito |
|---|---|
| `VITE_API_KEY` | API key web del proyecto Firebase (identifica el proyecto ante los servicios de Firebase; no es un secreto de servidor). |
| `VITE_AUTH_DOMAIN` | Dominio de autenticación de Firebase (flujo OAuth). |
| `VITE_PROJECT_ID` | ID del proyecto Firebase/GCP. |
| `VITE_STORAGE_BUCKET` | Bucket de Cloud Storage (configurado pero **no usado**, ver §5). |
| `VITE_MESSAGING_SENDER_ID` | Sender ID de FCM (no se usa messaging en la app). |
| `VITE_APP_ID` | App ID de Firebase. |

*No se incluye ningún valor.* Los scripts de `scripts/` **no** usan estas variables: cargan
credenciales desde el archivo JSON de service account (ver §5.5).

Otros archivos de configuración: `vite.config.js` (alias `@`→`src`, plugins Tailwind/PostCSS),
`tailwind.config.js`, `postcss.config.js`, `eslint.config.js`, `vercel.json` (rewrite SPA).

---

## 7. Estado del código

### 7.1 Terminado y en uso [verificado]
- Autenticación + guard de rutas + gestión de rol/admin (`App.jsx`).
- CRUD de organismos, UF, pools; asignación de editores; gestión de usuarios.
- Reporte de completitud + export a PDF (`GestionOrganismosForm.jsx`) — la lógica de completitud
  está bien alineada con `SPEC.md` §1 y §6.
- Formulario de taxonomía (`TaxonomiaForm.jsx`) y su persistencia.
- Embed de Data Studio (`ReportesPage.jsx`).

### 7.2 A medio hacer / abandonado / código muerto [verificado]
- **`importarTaxonomiaDesdeCSV.js`** — huérfano (no se importa). Además sus diccionarios de mapeo
  divergen del catálogo canónico: p. ej. `presenciaTerritorialMap` mapea a códigos `A/B/C/D/F`
  (`importarTaxonomiaDesdeCSV.js:60-67`) mientras que `taxonomiaOptions.presencia_territorial`
  ofrece `A/B/C/D` (`taxonomiaOptions.js:51-56`); `alcanceFueroMap` usa `E` para "Otro" y
  `presenciaTerritorialMap` usa `F`. Si alguna vez se cableó, pudo haber escrito códigos que la UI no
  reconoce.
- **`layout.jsx` (`Layout`)** — componente completo sin usar.
- **`ui/label.jsx` (`Label`)** y **`ui/card.jsx` → `CardTitle`** — exportados y sin uso.
- **Imports sin uso:** `App.jsx:6` importa `BrowserRouter as Router` que **nunca se renderiza** (el
  router lo provee `main.jsx:9`); `ListaOrganismosForm.jsx:6` importa `Building2` de lucide sin
  usarlo; `firebase.js:19` re-exporta `provider`, `signInWithPopup`, `signOut` que ningún módulo
  consume (App importa esos símbolos directo de `firebase/auth`, `App.jsx:4`).
- **`dist/`** — artefacto de build presente en disco (gitignored); puede estar desactualizado
  respecto al código.

### 7.3 Duplicación e inconsistencias a tener presentes [verificado]
- **Doble fuente de verdad de la sesión:** `App.jsx:20` usa `useAuthState(auth)`; en paralelo
  `UserContext.jsx:11-22` se suscribe con `onAuthStateChanged`. `MenuPage` consume `useUser()`
  mientras el resto recibe `user` por props. Son dos suscripciones al mismo estado.
- **`Button` ignora `variant`/`size`:** `ui/button.jsx:4` solo desestructura
  `{ children, onClick, type, className }`. Sin embargo se le pasan `variant="outline"` (×4),
  `variant="destructive"`, `variant="secondary"`, `variant="primary"` y `size="sm"` en varios
  llamados (p. ej. `OrganismoDetailTabs.jsx:76-81`, `ListaUnidadesFuncionalesForm.jsx:126-131`,
  `VolverAlMenu.jsx:18`). Todos esos botones **se ven iguales** (azul), sin el estilo pretendido.
- **Casing enum vs. datos:** claves en MAYÚSCULAS en `coloresTipoOficina`
  (`ListaOrganismosForm.jsx:9-14`) contra datos en minúscula (documentado en `SPEC.md` §1.7). El
  mismo tipo de problema con `fuero_simplificado` ya se corrigió en el código (`SPEC.md` §4.1) pero
  quedan 14 organismos con `multifuero` y ~10 vacíos según el relevamiento de `SPEC.md` §4.
- **Tipos string donde se espera número:** `anio_implementacion` y `jueces_asistidos` se guardan como
  strings de inputs de texto (`UnidadFuncionalForm.jsx:262-268,316-322`), pero `evaluarUF` los trata
  como numéricos (`GestionOrganismosForm.jsx:38`).
- **`copiarDatosDeGoogleAFirestore` se ejecuta dos veces por login** (§3.2) y llama `navigate('/')`
  en cada verificación (`App.jsx:60`).
- **Ortografía de provincias sin tilde a propósito** (`"Entre Rios"`, `"Rio Negro"`,
  `organismoOptions.js:33-58`) para coincidir con `localidades`; documentado en `SPEC.md` §5.3. El
  catálogo tiene 24 jurisdicciones pero `localidades` cubre menos (SPEC menciona faltantes).
- **Forma dual de la taxonomía en memoria (`{v1:{...}}`) vs. documento (`v1`)** — ver §2.4.

---

## 8. Qué quedó sin poder determinarse desde el repo (y qué haría falta)

1. **Pipeline Firestore → BigQuery** (mecanismo, frecuencia, tablas/vistas): revisar Firebase
   Console → Extensions y GCP Console → BigQuery + Cloud Scheduler. (§4)
2. **Consultas/vistas de BigQuery y qué dashboard consume cada una:** revisar los data sources del
   report `c3658d7d-…` en Looker Studio y el dataset de BigQuery. (§4)
3. **Contenido vigente de las Firestore Security Rules:** el repo tiene una transcripción fechada
   2026-07-27 en `SPEC.md` §3.3/§6.3, pero la fuente de verdad está en Firebase Console. Confirmar
   que no cambió. (§5.3)
4. **Configuración del proyecto Vercel** (env vars de producción, dominios, protecciones): consola de
   Vercel.
5. **Para qué se instalaron `@google-cloud/bigquery` y `googleapis`** (sin uso en el repo): decisión
   histórica no rastreable desde el código.
6. **Estado real de los datos en Firestore:** este documento describe lo que el *código asume*. La
   validación contra los datos reales está en `docs/verificacion-datos-firestore.md`.
