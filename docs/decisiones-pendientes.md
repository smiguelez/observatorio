# Decisiones pendientes — proyecto de reformulación del Observatorio

> Estas decisiones no son principios de constitution: son decisiones de
> modelado o de infraestructura que corresponden a la spec específica donde
> se necesitan. Se listan acá para no perderlas mientras se resuelven.

---

**D1 — Autenticación: RESUELTA (2026-09).**
La app soportará usuario/contraseña propio, Google Sign-In, y otros métodos a
evaluar. Ver Principios III, IV y V de la constitution.

*Queda abierto dentro de esta decisión:* qué métodos adicionales se evalúan
además de los dos confirmados, y con qué prioridad. No bloquea el diseño del
backend — el modelo de identidad ya está definido para soportar métodos
nuevos sin reescritura.

---

**D2 — ¿Qué reemplaza a Looker Studio y al pipeline hacia BigQuery?**
No se puede decidir hasta saber qué hay: el mecanismo de exportación, las
vistas y qué dashboard consume cada una son puntos ciegos (auditoría §4, §8).
No bloquea el modelo de datos ni el backend, pero sí la spec de reporting —
es la cuarta feature en la secuencia, no la primera.

---

**D3 — `fuero_simplificado`: RESUELTA (2026-09).**
Deja de ser un campo cargado a mano: el modelo nuevo incorpora un listado de
fueros que el organismo asiste (relación organismo↔fuero, cardinalidad
múltiple), y `fuero_simplificado` pasa a ser un **campo calculado** a partir
de ese listado — "multifuero" cuando hay más de uno seleccionado. Al ser
calculado, sigue disponible para consumo desde Data Studio sin cambios en esa
punta (resuelve el impacto en reporting que se había señalado).

*Migración de los datos existentes:* los organismos que hoy están vacíos en
`fuero_simplificado` quedan sin fueros asignados tras la migración; la carga
real se completa después, por gestión con los referentes provinciales — esto
no bloquea el resto del proyecto.

*Punto de confirmación cerrado (2026-09):* se usan dos valores de migración
distintos, no uno solo —

- `sin_fueros_asignados` — para los vacíos reales (dato faltante o
  administrativo genuino).
- `multifuero_sin_detalle` — para los 14 que hoy dicen "multifuero": preserva
  el hecho conocido de que asisten a más de un fuero, sin inventar cuáles.

Motivo: fusionarlos habría perdido un dato ya conocido y hecho que reportes de
"organismos sin asistencia a ningún fuero" incluyeran, mientras dura la carga
pendiente, a 14 organismos que en realidad asisten a varios.

*Sigue abierto, no bloquea nada:* dónde vive el cálculo de
`fuero_simplificado` (columna generada de Postgres, cálculo en backend, o
vista) — es decisión de `/speckit-plan`, no de la spec.

---

**D4 — Clave primaria de usuarios, ahora con múltiples métodos de login.**
Hoy el email es el id del documento y también la referencia de ownership en
`organismos.usuario_google` y `organismos.editores[]`. Con dos o más métodos
de autenticación coexistiendo, mantener el email como clave primaria es más
frágil que antes — un mismo usuario puede tener el mismo email verificado por
distintos proveedores, y un id subrogado interno (serial o UUID) con el email
como columna `unique` separa mejor "quién es el usuario" de "cómo probó
quién es".

*Resultado de V1.1 (2026-09):* 0 colisiones de email por casing en los datos
actuales — 46 de 46 ids son emails válidos en minúscula, sin mismatches
contra el campo `email`. La recomendación de id subrogado ya no se apoya en
limpieza de datos existentes (no hay nada que limpiar): es una decisión de
diseño hacia adelante, motivada por Principio V (identidad unificada), no por
un problema encontrado en los datos.

---

**D5 — Infraestructura de despliegue.**
El servidor está en un data center, pero no está definido si Cloudflare
Tunnel forma parte de la topología nueva, ni cómo se despliega el frontend
(¿sigue en Vercel? ¿pasa al servidor propio?). No bloquea el modelo de datos;
sí bloquea las specs de backend y frontend.

---

**D6 — Tercer estado para UF sin jueces asignados: RESUELTA (2026-09).**
El modelo actual asume que toda UF está en modo "cantidad directa"
(`jueces_asistidos` poblado) o modo "pool" (`pool_jueces_id` poblado),
mutuamente excluyentes. La verificación V3.3 encontró 2 UF (de 277) sin
ninguno de los dos poblados — identificadas como la única UF de organismos
puramente administrativos ("Secretaria de gestión administrativa", "Oficina
de Gestión Digital"), confirmado por Santi.

No es dato faltante: es un caso legítimo que el modelo original no
contemplaba. El modelo relacional agrega un tercer estado explícito —
`no_aplica` (o equivalente) — junto a cantidad directa y pool, para UF de
organismos sin jueces asignados por diseño.

---

**D7 — `anio_implementacion`: formato libre e inconsistente.**
V3.7 encontró texto libre real, no solo años: fechas completas
(`"1/7/2021"`), texto descriptivo (`"2015. Refuncionalización 2024"`), un
valor sin sentido como año (`"9"`), y una cadena vacía — 14 casos de 277 UF
con formato no estándar, más 1 completamente ausente.

Recomendación: dos columnas en vez de una — `anio_implementacion` (integer,
nullable, con el año extraído donde se pueda parsear con confianza) y
`anio_implementacion_texto_original` (text, preserva el valor tal cual para
los casos que no parseen limpio). Evita perder el dato real por forzarlo a un
tipo que no le cabe (Principio VII). Pendiente de confirmar con Santi antes
de `/speckit-plan`.
