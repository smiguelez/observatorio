# SPEC.md — Observatorio

## Convención de este archivo
Cada funcionalidad nueva se documenta como una sección propia, con fecha de creación. No se borran specs anteriores al implementarlas: se marcan como `[Implementado]` y se dejan como referencia histórica de decisiones.

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
