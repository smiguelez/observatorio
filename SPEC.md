# SPEC.md — Observatorio

## Convención de este archivo
Cada funcionalidad nueva se documenta como una sección propia, con fecha de creación. No se borran specs anteriores al implementarlas: se marcan como `[Implementado]` y se dejan como referencia histórica de decisiones.

## Pendientes — resumen
Lista rápida de lo que falta instalar/resolver, con link a la sección de detalle:
- **Migración a Postgres + hosting ARSAT** (§2) — en planificación, no iniciado.
- **Rediseño del modelo de fueros** — normalización a minúsculas ya hecha (§4.1); falta el array `fueros` para representar `multifuero` (§4.2) — no iniciado, sin fecha.
- ~~**Verificación de Firestore Security Rules**~~ — confirmado y documentado 2026-07-27 (§3.3): rol admin (`esAdmin()`) y acceso de owner/editor (`esOwnerOEditor()`) están validados del lado del servidor. La restricción de `provincia` en el alta de organismo (§5.2) sigue siendo solo client-side — las rules no la validan.
- **Alta de organismo** (§5) — implementado, pendiente prueba manual end-to-end en navegador.
- **Asignación de `provincia` a usuarios no-admin** — no existe ningún formulario para cargar `users.provincia` (§5.2); hasta que se resuelva, todo usuario no-admin ve el mensaje de "no podés crear organismos".

---

## 1. Reportes de completitud por organismo/UF (branch `feature/reportes-monitoreo`) [Implementado]
**Fecha:** 2026-07-04
**Estado:** Implementado 2026-07-04
**Archivo a modificar:** `src/components/GestionOrganismosForm.jsx` (no crear componente nuevo — acceso admin-only, ya existente)

### 1.1 Alcance
Extender la vista admin existente para mostrar, además del listado actual de organismos por usuario:
- Un resumen inicial de completitud de unidades funcionales (UF), agrupado por usuario.
- Un detalle completo de organismos y sus UF, agrupado por provincia.

### 1.2 Reglas de negocio — completitud

Un **organismo** se considera completo si cumple las tres condiciones:
1. Tiene al menos 1 unidad funcional (`unidades_funcionales.length >= 1`). Si tiene 0, se marca **incompleto** con motivo `"Sin unidades funcionales"`.
2. La subcolección `taxonomia/v1` existe y sus 9 campos anidados tienen valor no vacío:
   - `gestion.autonomia`
   - `institucional.insercion_institucional`
   - `institucional.jerarquia_normativa`
   - `organizacion.dependencia`
   - `organizacion.asistencia_jurisdiccional`
   - `implementacion.alcance_proceso`
   - `implementacion.alcance_fuero`
   - `implementacion.presencia_territorial`
   - `implementacion.grado_implementacion`

   Si falta alguno: **incompleto**, motivo `"Taxonomía incompleta: [campos faltantes]"`.

   **Excepción:** esta regla aplica únicamente cuando `tipo_oficina` es `"OFICINA JUDICIAL"` u `"OFICINA JUDICIAL ESPECIALIZADA"`. Para `"COORDINACIÓN"`, `"UNIDAD OPERATIVA"` u otros valores, la taxonomía se omite completamente: no se evalúa, no suma ni resta a la completitud del organismo.

3. Cada documento de `unidades_funcionales` tiene todos sus campos con valor no vacío:
   `denominacion_unidad`, `localidad_id`, `tipo_uf`, `domicilio`, `codigo_postal`, `telefono`, `mail`, `responsable`, `jueces_asistidos`, `anio_implementacion`.
   Adicionalmente, `jueces_asistidos` debe ser convertible a número. Si tiene valor pero no es numérico, la UF se marca incompleta con motivo `"jueces_asistidos: debe ser numérico"`. Esta validación es solo de reporte — el formulario de carga (`UnidadFuncionalForm.jsx`) no se modifica.

Una **unidad funcional (UF)** individual se considera completa si cumple la condición 3 por sí sola (todos sus campos con valor y `jueces_asistidos` numérico).

**Casos especiales — mostrar siempre como "incompleto" con motivo aclarado, nunca mezclados en un solo número:**
- Organismo sin ninguna UF → no aporta al conteo de UF (ni completas ni incompletas), pero aparece en el detalle como incompleto con motivo "Sin unidades funcionales".
- UF con campos faltantes → incompleta, motivo "Campos faltantes: [lista]".

### 1.3 Resumen inicial (agrupado por `usuario_google`)
Por cada usuario, mostrar:
```
usuario@ejemplo.com: N unidades funcionales completas / M incompletas
```
El conteo es de **unidades funcionales**, no de organismos.

### 1.4 Detalle (agrupado por provincia)
```
Provincia A
├── Organismo X (usuario_google: usuario1@ejemplo.com) — estado: completo / incompleto (motivo)
│   ├── Unidad Funcional 1 — completa/incompleta (motivo si aplica), todos sus campos visibles
│   └── Unidad Funcional 2 — ídem
├── Organismo Y (usuario_google: usuario2@ejemplo.com)
...
Provincia B
...
```
**Nota de implementación (2026-07-04):** la agrupación original de `GestionOrganismosForm.jsx` (organismos por usuario, sin completitud) fue reemplazada por esta nueva estructura (resumen por usuario + detalle por provincia), no convive con la anterior. Validado como aceptable: único usuario del formulario es el propio admin del sistema.

### 1.5 Performance
- Volumen actual: ~100 organismos, ~260 unidades funcionales — no requiere paginación ni lazy-load.
- Fetch de subcolecciones (`unidades_funcionales`, `taxonomia`) por organismo debe hacerse en paralelo (`Promise.all`), no secuencial, para no sumar latencia innecesaria.

### 1.6 Deuda técnica anotada — NO resolver en este spec
- `GestionOrganismosForm.jsx` no tiene verificación visible de rol admin más allá del chequeo en cliente. No hay confirmación de que existan Firestore Security Rules del lado del servidor validando `rol == 'admin'`.
- **Decisión:** se posterga la corrección hasta la migración a Postgres (branch `develop`), dado que los datos son públicos (información institucional de oficinas judiciales) y no hay riesgo de confidencialidad.
- **Fecha de esta decisión:** 2026-07-04. Si la migración se extiende más de unos meses desde esta fecha, revisar si vale la pena resolver esto antes, igual.
- **Actualización 2026-07-23:** ver también §3.3 — la misma duda sobre Firestore Security Rules se extiende ahora a la validación de `editores`/`usuario_google` (feature de §3). Sigue sin resolverse ni verificarse; no se encontró ningún `firestore.rules` versionado en el repo.
- **Actualización 2026-07-27:** resuelto — ver §3.3. Las rules confirmadas incluyen `esAdmin()`, que restringe `get`/`list` sobre `organismos` (y por lo tanto el listado completo que usa `GestionOrganismosForm.jsx`) a admins u owners/editores del documento. Siguen sin versionarse en el repo (viven solo en Firebase Console), pero su contenido ya está documentado en §3.3.

### 1.7 Corrección de casing en `TIPOS_CON_TAXONOMIA` [Implementado]
**Fecha:** 2026-07-27

`TIPOS_CON_TAXONOMIA` (constante de `GestionOrganismosForm.jsx` que decide si a un organismo se le exige `taxonomia/v1` completa, ver regla 2 de §1.2) estaba hardcodeada como `['OFICINA JUDICIAL', 'OFICINA JUDICIAL ESPECIALIZADA']` (mayúsculas), pero el dato real de `tipo_oficina` en Firestore está en minúscula en 113 de los 114 organismos (mismo patrón que el hallazgo de `fuero_simplificado`, ver §4). Con el enum en mayúsculas, la comparación `TIPOS_CON_TAXONOMIA.includes(tipo_oficina)` no matcheaba casi nunca, así que la excepción de la regla 2 no se aplicaba como estaba pensado.

Corrección aplicada:
- `TIPOS_CON_TAXONOMIA` pasa a minúsculas: `['oficina judicial', 'oficina judicial especializada']`.
- La comparación se hace case-insensitive como defensa adicional: `TIPOS_CON_TAXONOMIA.includes((tipo_oficina || '').toLowerCase())`, para no volver a romperse si aparece algún valor en otro casing (como el único documento `PENAL` de §4).

---

## 2. Migración de arquitectura (branch `develop`) — pendiente de spec detallado
**Estado:** En planificación, no iniciado

Puntos ya acordados, a formalizar en spec propio antes de codificar:
- Reemplazo de Firestore por Postgres propio (volumen de datos bajo, sin ORM decidido — evaluar Drizzle por afinidad con runtime serverless/liviano).
- Se mantiene Firebase Authentication (Google Sign-In) sin cambios — no es necesario ni conveniente reemplazarlo.
- Nueva infraestructura: hosting propio en servidores de ARSAT (reemplaza Vercel), acceso VPN solo para administración/desarrollo, aplicación pública accesible directo por internet.
- Postgres debe quedar en red interna, sin exposición directa a internet, ni siquiera detrás de autenticación.
- Pendiente: confirmar con el equipo de ARSAT los puntos de la lista de preguntas de infraestructura (IP pública, SSL, acceso al servidor, CI/CD, backups, compliance institucional, continuidad del dominio actual).
- Auditoría de código pendiente, por módulos, antes de diseñar el esquema relacional (ya se hizo un primer relevamiento de Firestore — ver documento de análisis del 2026-07-04).

---

## 3. Editores por organismo (branch `feature/mejoras-actuales`, PR #2) [Implementado]
**Fecha:** 2026-07-07
**Estado:** Implementado 2026-07-07 (commit `3587c06`)
**Archivos:** `src/components/AsignarEditoresForm.jsx` (nuevo), `src/components/ListaOrganismosForm.jsx`, `src/components/MenuPage.jsx`, `src/App.jsx`

### 3.1 Alcance
Un organismo puede tener, además del `usuario_google` propietario, una lista `editores` (array de emails) con acceso de edición compartido:
- Nueva vista admin-only "Asignar Editores" (`/asignar-editores`), que agrupa organismos por provincia y permite agregar/quitar emails de la lista `editores` de cada uno.
- `ListaOrganismosForm.jsx` ahora resuelve los organismos visibles para un usuario con dos queries en paralelo (`usuario_google == user.email` y `editores array-contains user.email`), deduplicadas por id.

### 3.1.1 Migración de datos — `scripts/agregar-campo-editores.cjs`
Script de una sola corrida (Firebase Admin SDK + `serviceAccountKey.json`) que agrega `editores: []` a todos los documentos de `organismos` que no tuvieran el campo, sin tocar los que ya lo tenían. Modos:
- `node scripts/agregar-campo-editores.cjs` — aplica a todos los documentos.
- `--dry-run` — solo lista los documentos a modificar, no escribe.
- `--id=<documentId>` — limita la corrida a un documento puntual (combinable con `--dry-run`).

Usa `batch.update` con el valor explícito `{ editores: [] }` en vez de `FieldValue.arrayUnion`, porque `arrayUnion` no sirve para crear el campo cuando no existe.

### 3.1.2 `AsignarEditoresForm.jsx` — selección múltiple por provincia
Flujo real del formulario:
1. Carga todos los documentos de `organismos` una sola vez al montar.
2. El usuario elige una provincia en un `<select>` (derivada de `organismo.provincia`, agrupando los que no tienen provincia bajo `"Sin provincia"`); recién ahí se muestra la lista de organismos de esa provincia.
3. Cada organismo de la lista tiene un checkbox individual, más un checkbox "Seleccionar todos" que alterna todos los organismos filtrados de la provincia actual (usa un `Set` de ids seleccionados, no un array).
4. Un único input de email + botón "Agregar a seleccionados" valida el formato (regex simple `^[^\s@]+@[^\s@]+\.[^\s@]+$`), y aplica `arrayUnion(email)` en paralelo (`Promise.all`) a todos los organismos tildados — no hay un input de email por organismo.
5. Cada organismo listado muestra sus `editores` actuales con un botón "Quitar" individual por email, que aplica `arrayRemove(email)` sobre ese documento puntual.
6. El estado local (`organismos`) se actualiza en el cliente tras cada operación exitosa, sin re-fetch completo de Firestore.
7. Cambiar de provincia limpia la selección de checkboxes y el input de email en curso.

### 3.2 Nota de documentación retroactiva
Esta sección se agrega el 2026-07-23, con posterioridad a la implementación, para cerrar el hueco de documentación: la funcionalidad ya estaba mergeada a `main` pero no tenía sección propia, en contra de la convención de este archivo.

### 3.3 Firestore Security Rules [Confirmado]
**Fecha de confirmación:** 2026-07-27

El mensaje del commit `3587c06` incluye "security rules" entre sus cambios, pero no se encontró ningún archivo `firestore.rules` versionado en el repo — viven únicamente en Firebase Console, fuera de control de versiones. Se pegó a continuación el contenido real vigente al 2026-07-27, copiado directamente de la consola, para cerrar la duda de §1.6/§5.2 sobre si la validación es real o solo client-side:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function esAdmin() {
      return request.auth != null &&
        get(/databases/$(database)/documents/users/$(request.auth.token.email)).data.keys().hasAll(['rol']) &&
        'admin' in get(/databases/$(database)/documents/users/$(request.auth.token.email)).data.rol;
    }

    function esOwnerOEditor(datos) {
      return request.auth != null && (
        request.auth.token.email == datos.usuario_google ||
        (datos.keys().hasAll(['editores']) && request.auth.token.email in datos.editores)
      );
    }

    match /organismos/{id} {
      allow get, list: if esOwnerOEditor(resource.data) || esAdmin();
      allow update, delete: if esOwnerOEditor(resource.data) || esAdmin();
      allow create: if request.auth != null &&
        request.resource.data.usuario_google == request.auth.token.email;

      match /unidades_funcionales/{ufId} {
        allow read, write: if esOwnerOEditor(get(/databases/$(database)/documents/organismos/$(id)).data) || esAdmin();
      }
      match /taxonomia/{taxId} {
        allow read, write: if esOwnerOEditor(get(/databases/$(database)/documents/organismos/$(id)).data) || esAdmin();
      }
    }

    match /users/{userId} {
      allow read: if request.auth != null;
      allow write: if request.auth.token.email == userId || esAdmin();
    }

    match /localidades/{id} {
      allow read: if request.auth != null;
    }
  }
}
```

Puntos que esto resuelve:
- `esAdmin()` y `esOwnerOEditor()` validan del lado del servidor exactamente lo que las pantallas ya asumían del lado del cliente: rol admin (duda de §1.6) y ownership/`editores` (duda original de esta sección).
- `allow create` en `organismos` está separado de `get`/`list`/`update`/`delete` — se agregó hoy (2026-07-27) porque un documento nuevo todavía no tiene owner ni editores contra los cuales evaluar `esOwnerOEditor()`; la regla de creación solo exige que `usuario_google` del documento a crear coincida con el email autenticado.
- Las subcolecciones `unidades_funcionales` y `taxonomia` heredan la misma validación, resolviendo también la duda de §1.6 sobre si esas lecturas/escrituras estaban protegidas.

Punto que esto **no** resuelve — sigue abierto:
- `allow create` no valida `provincia`. La restricción de §5.2 (admin puede elegir cualquier provincia, no-admin solo la propia) sigue siendo enforcement exclusivamente client-side: un usuario no-admin autenticado podría, en teoría, crear un organismo con cualquier `provincia` saltándose la UI. No hay urgencia asumida dado que los datos son públicos (mismo criterio que §1.6), pero queda anotado para cuando se revisen las rules de nuevo.

---

## 4. Modelo de fueros — rediseño futuro (no iniciado)
**Fecha:** 2026-07-23
**Estado:** Normalización de mayúsculas/minúsculas implementada 2026-07-23. Resto (array `fueros`, `multifuero`) pendiente, sin fecha de inicio.

### Hallazgo
`fuero_simplificado` es un único campo string por organismo. Relevamiento real sobre los 114 documentos de `organismos` (2026-07-23, vía `scripts/inspeccionar-campos-organismos.cjs`, solo lectura) encontró la siguiente distribución de valores:

| Valor | Cantidad |
|---|---|
| `penal` | 40 |
| `civil` | 26 |
| `multifuero` | 14 |
| `laboral` | 12 |
| `familia` | 11 |
| (vacío) | 10 |
| `PENAL` (mayúscula) | 1 |

Es decir: **113 de los 114 documentos** ya estaban en minúsculas — el enum hardcodeado que usaba el código (`PENAL`, `CIVIL`, `FAMILIA`, `LABORAL`) era el que estaba en el caso equivocado, no los datos.

### 4.1 Resuelto — enum del código pasado a minúsculas [Implementado]
**Fecha:** 2026-07-23
En vez de migrar los datos, se cambió el enum hardcodeado y la lógica de normalización a minúsculas, que es el caso real de la enorme mayoría de los documentos:
- `OrganismoForm.jsx`: `fueroOptions` ahora es `["penal", "civil", "familia", "laboral"]`; `valorActualFuero` normaliza con `.toLowerCase()` en vez de `.toUpperCase()`.
- `ListaOrganismosForm.jsx`: claves de `coloresFuero` en minúsculas; el lookup del badge normaliza con `.toLowerCase()`.
- El único documento con valor `PENAL` (mayúscula) sigue funcionando: normaliza a `penal` para el badge/color, y el `<select>` lo deja editar vía value directo (no rompe, pero al guardar cualquier cambio queda en minúsculas como el resto).

Esto no requirió tocar datos en Firestore — el cambio es solo de código.

### 4.2 Pendiente — `multifuero` y campo `fueros` (array)
Sigue sin resolver el caso de los 14 organismos (~12%) con valor `"multifuero"`: no matchea ninguna de las 4 opciones del `<select>`, se sigue mostrando vía el fallback "valor existente no listado". Diseño futuro propuesto, sin fecha de inicio:
- Nuevo campo `fueros` (array) para representar todos los fueros que atiende un organismo.
- `fuero_simplificado` se mantiene como derivado/resumen para reportes agregados y colores de badge — criterio de cómo se deriva (¿el más frecuente? ¿asignación manual?) queda a definir.
- Migrar los 14 casos `multifuero` y los 10 casos vacíos al poblar el nuevo array `fueros`.
- Considerar tabla de catálogo `fueros` en la migración a Postgres (branch `develop`, §2), en vez de mantener el enum hardcodeado en el código como está hoy.

### No incluido en este spec
La normalización de §4.1 ya se implementó. El array `fueros` de §4.2 es una nota de diseño para una funcionalidad futura, sin fecha de implementación.

---

## 5. Alta de organismo (branch `feature/edicion-fuero-y-alta-organismo`) [Implementado]
**Fecha:** 2026-07-23
**Estado:** Implementado 2026-07-23. Probado con lint y build; **pendiente prueba manual end-to-end en navegador** (login + creación real) antes de darlo por validado.
**Archivos:** `src/components/CrearOrganismoForm.jsx` (nuevo), `src/constants/organismoOptions.js` (nuevo), `src/components/OrganismoForm.jsx` (refactor), `src/App.jsx`, `src/components/MenuPage.jsx`

### 5.1 Alcance
Nuevo formulario en `/crear-organismo`, visible para cualquier usuario autenticado (no solo admin), que da de alta un documento en `organismos`.

Campos: `denominacion`, `denominacion_simplificada` (select), `tipo_oficina` (select), `provincia`, `fuero_simplificado` (select) — los 5 obligatorios. Al crear, además se setea `usuario_google = email del creador`, `editores: []`, `legacy_id: null`, `actualizado_a: serverTimestamp()`. No crea `taxonomia` ni `unidades_funcionales` (se cargan después desde el detalle, como ya funciona para organismos existentes).

### 5.2 Reglas de acceso a `provincia` (client-side)
- Admin: `provincia` es un select editable con las 24 jurisdicciones (ver 5.3).
- No-admin: se lee `provincia` de `users/{email}` (Firestore). Si existe, el campo queda fijo/no editable con ese valor. Si no existe, no se renderiza el formulario — se muestra un mensaje pidiendo que un admin le asigne provincia. Hoy no hay ningún formulario que cargue `provincia` en `users`, así que todo usuario no-admin ve ese mensaje hasta que se resuelva manualmente (ej. edición directa en Firestore) o se construya una pantalla para asignarla.
- **Client-side únicamente para `provincia`** — a diferencia de `usuario_google`/`editores`/rol admin (ya confirmados server-side, ver §3.3), la regla `allow create` de `organismos` no valida `provincia`. Ver el punto abierto al final de §3.3.

### 5.3 Catálogo de provincias (nuevo, hardcodeado)
No existía ninguna lista canónica de las 24 jurisdicciones (provincias + CABA) en el código ni en Firestore — la colección `localidades` solo cubre 21 (le faltan La Rioja, Misiones y Santa Cruz, sin localidades cargadas aún). Se agregó `provinciaOptions` en `src/constants/organismoOptions.js`, respetando la ortografía ya usada en `localidades` (ej. "Entre Rios", "Rio Negro" sin tilde) para no introducir una grafía distinta que rompa agrupaciones por provincia en otras pantallas (mismo tipo de problema que tenía `fuero_simplificado`, ver §4).

### 5.4 Refactor: opciones de organismo a archivo compartido
`denominacionSimplificadaOptions`, `tipoOficinaOptions` y `fueroOptions` estaban hardcodeadas dentro de `OrganismoForm.jsx`. Se movieron a `src/constants/organismoOptions.js` para reusarlas en `CrearOrganismoForm.jsx` sin duplicar el array de 39 denominaciones; `OrganismoForm.jsx` ahora las importa de ahí. Sin cambio de comportamiento.
