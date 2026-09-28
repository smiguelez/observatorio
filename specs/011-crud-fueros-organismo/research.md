# Research: editar los fueros de un organismo (011)

## Decisión 1 — Autorización: reusar `autorizarContraOrganismoPadre`, no una regla propia

**Fuente**: código real — `backend/src/authz/organismos.ts`
(`puedeGestionarOrganismo` = `esOwnerOEditor() || esAdmin()`),
`backend/src/routes/organismos.ts` (el `GET /api/organismos/:orgId/fuero`
actual ya usa `autorizarContraOrganismoPadre`, el mismo helper que las
subrutas de UF y taxonomía).

**Decisión.** El `PUT` nuevo usa el mismo `autorizarContraOrganismoPadre`
que ya protege el `GET` de esta misma subruta — exactamente lo que pidió
el usuario ("misma regla ya vigente... sin ninguna regla nueva").

**Alternativas evaluadas.**

| Opción | Resultado |
|---|---|
| **`autorizarContraOrganismoPadre`** (elegida) | Ya protege el `GET` de esta misma subruta; cero código de autorización nuevo. |
| `autorizarPropietarioOAdmin` (la regla más angosta que usan los editores) | Descartada: es una regla deliberadamente MÁS estricta que la del resto del organismo (excluye a los editores, research.md de `006` Decisión 4) — el pedido original es explícito en que fueros usa la regla general, no la de editores. |

---

## Decisión 2 — Forma del endpoint: `PUT /api/organismos/:orgId/fuero`, reemplazo completo

**Fuente**: `backend/src/routes/organismos.ts` (`PUT
/api/organismos/:orgId/taxonomia` ya reemplaza una relación completa de la
misma forma — DELETE + INSERT en una transacción, respuesta con la misma
forma que el GET correspondiente).

**Decisión.** Mismo path que el `GET` ya existente (`/api/organismos/:orgId/fuero`),
método `PUT`, body `{ fueroIds: number[] }` — reemplaza TODO el listado en
una sola operación (no un `POST`/`DELETE` por fuero individual). Responde
con la misma forma que el `GET` (`{ fueros, fueroSimplificado }`), así el
frontend no necesita una segunda consulta para mostrar el resultado
recalculado (FR-003).

Dentro de la misma transacción (`conTransaccion`, ya usado en
`organismos.ts` para el cambio de tipo con pérdida de taxonomía):
1. Verificar el bloqueo de FR-004 (Decisión 4) — **antes** de tocar nada.
2. `DELETE FROM organismo_fueros WHERE organismo_id = $1` + `INSERT` de
   cada `fueroId` nuevo.
3. Actualizar `organismos.estado_fueros`: `'sin_fueros_asignados'` si el
   listado nuevo queda vacío, `'cargado'` en cualquier otro caso — nunca
   `'multifuero_sin_detalle'` (ese valor es exclusivo de la migración
   original, D3; esta pantalla siempre sabe exactamente cuáles son los
   fueros, así que nunca produce ese estado).

**Alternativas evaluadas.**

| Opción | Resultado |
|---|---|
| **`PUT`, reemplazo completo, mismo path que el `GET`** (elegida) | Mismo patrón ya probado (taxonomía); un solo viaje de ida y vuelta; el cliente arma el checklist a partir de casillas, natural como "conjunto completo", no como altas/bajas individuales. |
| `POST`/`DELETE` por fuero individual | Descartada: dos endpoints en vez de uno, y el frontend de todos modos junta el cambio en un solo guardado (checkboxes + botón "Guardar cambios", igual que el resto de `DatosTab.tsx`) — no hay un caso de uso real de alta/baja aislada. |

---

## Decisión 3 — El relleno inicial (spec.md, Assumptions) es un DETECTOR, no un rellenador — verificado, no hay de dónde copiar el valor

**Fuente**: consulta directa contra la base real (2026-09-28, confirmada
de nuevo para este plan) y `db/schema.sql` (`organismos` no tiene ninguna
columna de texto con el valor original de fuero — `fuero_simplificado`
es 100% una vista calculada desde `organismo_fueros`, no un dato
guardado aparte).

```sql
SELECT o.estado_fueros, count(DISTINCT o.id) AS organismos,
       count(DISTINCT ofu.organismo_id) AS con_al_menos_1_fila
FROM organismos o
LEFT JOIN organismo_fueros ofu ON ofu.organismo_id = o.id
GROUP BY o.estado_fueros;

 estado_fueros          | organismos | con_al_menos_1_fila
 cargado                | 97         | 97
 multifuero_sin_detalle | 20         | 0
 sin_fueros_asignados   | 1          | 0
```

**Decisión.** El caso que el pedido original describe para rellenar
("`cargado` con un valor único, sin ninguna fila en `organismo_fueros`")
tiene **0 ocurrencias hoy** (los 97 `cargado` ya tienen fila) — confirmado
con el usuario antes de escribir la spec (Assumptions, "se documenta igual
como la regla correcta, no porque haya algo pendiente"). Para este plan,
además, se confirma algo más importante: **si ese caso apareciera, el
esquema actual no tiene de dónde leer "el valor único" que habría que
copiar** — `fuero_simplificado` no es un dato guardado en ningún lado
aparte de `organismo_fueros` mismo (es una vista), así que un organismo
`cargado` con 0 filas no tiene ningún rastro de cuál era su fuero.

Por eso el script (`scripts/detectar-fueros-sin-poblar.ts`) no puede ser
un "rellenador desde una fuente" — es un **detector**, en la misma línea
que el runbook de corte ("el código detecta y se detiene, una persona
decide"): busca organismos `cargado` con 0 filas en `organismo_fueros` y,
si encuentra alguno, lo lista para resolución manual (no puede inventar
cuál era el fuero) — hoy, y siempre que se corra contra esta base,
encuentra 0. Los otros dos casos de la spec sí son accionables tal cual:
`multifuero_sin_detalle` (20 casos) queda explícitamente sin tocar
(esperando carga real, D3), y `sin_fueros_asignados` (1 caso) sin cambios.

**Alternativas evaluadas.**

| Opción | Resultado |
|---|---|
| **Script detector, no rellenador, mismo patrón dry-run/`--aplicar` que `normalizar-denominaciones.ts`** (elegida) | Es lo único honesto dado que no existe una fuente para "el valor único" — y aun así reusa el patrón ya establecido del proyecto para este tipo de verificación de datos. |
| Inferir el fuero desde `denominacion` (p. ej. buscar "civil"/"penal" en el texto) | Descartada: es exactamente el tipo de "inventar una distribución" que el pedido original prohíbe explícitamente para `multifuero_sin_detalle` — el mismo criterio aplica acá: no hay una fuente confiable, no se adivina. |
| No escribir ningún script, dejarlo solo como nota en la spec | Descartada: el usuario pidió explícitamente un script con el patrón ya establecido — aunque hoy no tenga nada que hacer, sirve como red de seguridad si aparece el caso en el futuro (otra fuente de datos, un bug en una carga posterior). |

---

## Decisión 4 — Cómo se implementa el bloqueo de FR-004 (fuero en uso)

**Fuente**: `db/schema.sql` — el trigger `asignacion_fuero_dentro_de_uf`
solo corre `BEFORE INSERT OR UPDATE ON asignacion_fueros`: protege que una
asignación nueva no exceda los fueros del organismo, pero **no hay nada
del lado de `organismo_fueros`** que impida borrar un fuero que una
asignación ya está usando — un `DELETE` directo sobre `organismo_fueros`
pasa sin que ningún trigger existente lo note.

**Decisión.** Antes de reemplazar el listado (Decisión 2, paso 1), una
consulta calcula qué fueros del listado ACTUAL desaparecerían con el
listado nuevo, y si alguno de esos tiene una fila en `asignacion_fueros`
para alguna unidad funcional de este organismo, la operación completa se
rechaza con `400` (`ErrorNegocio`, mismo mecanismo que ya usan `usuarios.ts`/
`organismos.ts` para otros rechazos de negocio) y un mensaje que nombra
los fueros bloqueando — ninguna escritura ocurre (ni el `DELETE`, ni el
`UPDATE` de `estado_fueros`), todo dentro de la misma verificación previa
a la transacción de escritura.

**Alternativas evaluadas.**

| Opción | Resultado |
|---|---|
| **Chequeo explícito antes de escribir, mismo `ErrorNegocio` ya usado en el proyecto** (elegida) | Hace explícita la integridad referencial que el trigger existente deja parcialmente cubierta (Principio VIII) — consistente con cómo el proyecto ya resuelve "no borrar algo en uso" (pool en uso, `006`). |
| Agregar un trigger nuevo en la base (`BEFORE DELETE ON organismo_fueros`) | Descartada por ahora: es una migración nueva para un caso que se puede resolver enteramente en la capa de aplicación, con el mismo nivel de garantía (la escritura pasa siempre por este único endpoint) — más simple, consistente con cómo ya se resuelven casos similares en este backend (verificación en la ruta, no en un trigger nuevo). |
