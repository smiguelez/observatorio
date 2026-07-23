# SPEC.md — Observatorio

## Convención de este archivo
Cada funcionalidad nueva se documenta como una sección propia, con fecha de creación. No se borran specs anteriores al implementarlas: se marcan como `[Implementado]` y se dejan como referencia histórica de decisiones.

## Pendientes — resumen
Lista rápida de lo que falta instalar/resolver, con link a la sección de detalle:
- **Migración a Postgres + hosting ARSAT** (§2) — en planificación, no iniciado.
- **Rediseño del modelo de fueros** — normalización a minúsculas ya hecha (§4.1); falta el array `fueros` para representar `multifuero` (§4.2) — no iniciado, sin fecha.
- **Verificación de Firestore Security Rules** (rol admin y validación de `editores`/`usuario_google`) (§1.6, §3.3) — estado real sin confirmar, pendiente de chequear en Firebase Console.

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

### 3.2 Nota de documentación retroactiva
Esta sección se agrega el 2026-07-23, con posterioridad a la implementación, para cerrar el hueco de documentación: la funcionalidad ya estaba mergeada a `main` pero no tenía sección propia, en contra de la convención de este archivo.

### 3.3 Pendiente de verificación — Firestore Security Rules
El mensaje del commit `3587c06` incluye "security rules" entre sus cambios, pero no se encontró ningún archivo `firestore.rules` versionado en el repo. No está confirmado si:
- (a) las reglas se configuraron manualmente en Firebase Console (fuera de control de versiones), o
- (b) el mensaje del commit se refiere solo a la lógica de visibilidad del lado del cliente (las dos queries de 3.1), sin reglas server-side reales que impidan a un usuario no autorizado leer/escribir organismos ajenos.

**Acción pendiente:** verificar el estado real de las Firestore Security Rules del proyecto en Firebase Console antes de asumir que la validación de `usuario_google`/`editores` (o el rol admin de §1.6) está resuelta del lado del servidor.

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
