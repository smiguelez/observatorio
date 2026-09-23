# Research: Endpoint de taxonomía de organismos, reconstruido para el modelo parametrizable

Feature `004-fix-taxonomia-endpoint`. Responde la pregunta técnica
explícita del usuario (Decisión 1) y documenta el resto de las decisiones
necesarias para implementar sin dejar ambigüedad de diseño.

---

## Decisión 1 — "Qué preguntas aplican a un tipo de organismo": una función SQL reutilizable, no una consulta duplicada en dos lugares

**La pregunta del usuario**: la Protección A (trigger sobre
`evaluaciones_taxonomicas`) y la Protección B (rama de
`PATCH /api/organismos/:id`) necesitan las dos, en algún momento, resolver
"¿esta pregunta aplica a este tipo de organismo?" contra
`taxonomia_pregunta_tipos_oficina`. ¿Conviene una consulta propia en cada
lugar, o una función SQL reutilizable que ambas llamen?

**Decisión**: una función SQL reutilizable,
`taxonomia_pregunta_aplica_a_tipo(p_pregunta_id bigint, p_tipo_oficina_id smallint) RETURNS boolean`,
`LANGUAGE sql STABLE` (no `plpgsql` — es una sola expresión, y el
planificador de Postgres puede *inlinear* una función SQL simple dentro de
la consulta que la llama, cosa que no hace con `plpgsql`; es, además, más
corta de leer):

```sql
CREATE FUNCTION taxonomia_pregunta_aplica_a_tipo(p_pregunta_id bigint, p_tipo_oficina_id smallint)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM taxonomia_pregunta_tipos_oficina
    WHERE pregunta_id = p_pregunta_id AND tipo_oficina_id = p_tipo_oficina_id
  );
$$ LANGUAGE sql STABLE;
```

Se define en la migración `0003` (Decisión 2) y se usa así:

- **Protección A** (trigger `BEFORE INSERT OR UPDATE ON evaluaciones_taxonomicas`):
  ```sql
  IF NOT taxonomia_pregunta_aplica_a_tipo(
    NEW.pregunta_id,
    (SELECT tipo_oficina_id FROM organismos WHERE id = NEW.organismo_id)
  ) THEN
    RAISE EXCEPTION '...';
  END IF;
  ```
- **Protección B** (consulta de detección de huérfanas, emitida vía `pg`
  desde `PATCH /api/organismos/:id`):
  ```sql
  SELECT DISTINCT p.codigo, p.texto
  FROM evaluaciones_taxonomicas e
  JOIN taxonomia_preguntas p ON p.id = e.pregunta_id
  WHERE e.organismo_id = $1
    AND NOT taxonomia_pregunta_aplica_a_tipo(e.pregunta_id, $2)  -- $2 = tipo nuevo, todavía no aplicado
  ```

**Rationale**:
- La regla ("¿esta pregunta aplica a este tipo?") es un concepto de
  dominio con nombre propio en el spec ("tipos aplicables", FR-014 de
  `003-taxonomia-parametrizable`), no una lectura trivial de una sola
  columna por clave primaria — a diferencia de, por ejemplo,
  `SELECT tipo_respuesta FROM taxonomia_preguntas WHERE id = ...`, que
  `validar_respuesta_taxonomia()` y `validar_opcion_tipo_pregunta()` (`0001`,
  `0002`) SÍ repiten cada una por su cuenta sin ninguna función compartida
  — precedente real de este mismo proyecto de aceptar esa clase de
  "duplicación" cuando es solo una lectura de columna. Acá la situación es
  distinta: es una relación (existencia en una tabla puente), consumida
  desde dos contextos de ejecución completamente distintos (un trigger de
  Postgres; un handler de Node vía `pg`), donde "leer la otra copia para
  mantenerla igual" es mucho más frágil que en el caso de la lectura de
  columna — un futuro cambio a la regla (por ejemplo, si algún día un
  `tipo_oficina_id` nulo en la pregunta significara "aplica a cualquier
  tipo") tendría que replicarse a mano en dos lenguajes distintos si no
  hay una función.
- Una función `boolean` escalar (no una función que devuelve un conjunto)
  es la forma que sirve igual de bien a los dos usos: como condición de un
  `IF` en el trigger (una sola fila), y como predicado de un `WHERE` en
  una consulta de conjunto en el handler (una fila por cada respuesta
  existente del organismo) — no hace falta una firma distinta para cada
  contexto ni una función que devuelva un conjunto.
- `LANGUAGE sql` en vez de `plpgsql`: al ser una sola expresión sin
  variables ni control de flujo, `sql` es más simple y permite que el
  planificador la trate como una subconsulta más (inlining), en vez de una
  llamada a función opaca — una optimización real, aunque a esta escala de
  datos (117 organismos, 9 preguntas) el rendimiento no es un factor
  decisivo por sí solo.

**Alternatives considered**:
- **Consulta propia en cada lugar** (sin función): descartada por el
  argumento de arriba — acá sí hay una regla de dominio nombrada,
  consumida desde dos tecnologías distintas, a diferencia del precedente
  de lectura-de-columna que este mismo proyecto sí acepta duplicar.
- **Una función que devuelve el conjunto de preguntas aplicables**
  (`taxonomia_preguntas_aplicables(tipo_oficina_id) RETURNS SETOF bigint`):
  evaluada y descartada — funcionaría igual (`EXISTS (SELECT 1 FROM
  taxonomia_preguntas_aplicables(...) WHERE pregunta_id = X)` en el
  trigger, `NOT EXISTS (...)` en el handler), pero es una forma más
  indirecta de expresar la misma pregunta booleana; la función escalar
  cubre ambos casos sin necesitar una forma de tabla.
- **Lógica en el handler únicamente, sin trigger** (Protección A resuelta
  solo en la aplicación): descartada de plano — es exactamente lo que el
  Principio VIII prohíbe (una convención de aplicación en vez de una
  garantía de esquema); cualquier otro camino de escritura futuro a
  `evaluaciones_taxonomicas` (no solo este endpoint) quedaría
  desprotegido.

---

## Decisión 2 — Protección A como migración `0003` nueva, mismo criterio que la 0002

**Decisión**: `backend/migrations/0003_taxonomia_tipo_organismo.ts`, no un
ajuste a `0001` ni a `0002`.

**Rationale**: mismo motivo exacto que ya se registró en
`003-taxonomia-parametrizable` (research.md, Decisión 5) para el mismo
tipo de situación: `0001` y `0002` ya están aplicadas y trackeadas en
`migrations.kysely_migration` — editarlas no volvería a ejecutar nada en
una base ya migrada, y dejaría el archivo diciendo algo distinto de lo que
el historial real registra. Es, además, un trigger conceptualmente
distinto (integridad organismo↔pregunta, no pregunta↔opción ni
respuesta↔opción) — no una corrección de `0002`, sino una guarda nueva.

`0003` agrega, en su `up()`:
1. La función `taxonomia_pregunta_aplica_a_tipo` (Decisión 1).
2. La función de trigger `validar_pregunta_tipo_organismo()` y el trigger
   `trg_evaluacion_tipo_organismo_valido BEFORE INSERT OR UPDATE ON evaluaciones_taxonomicas`.

Y en `down()`, la reversión completa en orden inverso (trigger, función de
trigger, función reutilizable) — mismo patrón que `0001`/`0002`.

**Alternatives considered**: ninguna real — la alternativa (ajustar `0001`)
ya fue evaluada y descartada por el mismo motivo en `003`; no hay una
razón nueva para reabrir esa decisión acá.

---

## Decisión 3 — Transacción explícita en la capa de aplicación: primera vez, helper mínimo compartido

**El problema**: dos operaciones de esta feature necesitan que varias
sentencias SQL se apliquen todas juntas o ninguna, algo que hasta ahora
ningún endpoint de este backend necesitó (cada ruta existente hace una
sola sentencia `INSERT`/`UPDATE`/`DELETE`, confiando en la atomicidad de
esa sentencia sola más los triggers de la base):

- `PUT` taxonomía (FR-006): reemplazar el conjunto completo de respuestas
  de un organismo — en la práctica, `DELETE` de las respuestas actuales +
  `INSERT` del conjunto nuevo, donde cada `INSERT` dispara los triggers de
  integridad (`003` y Protección A) y cualquier rechazo debe deshacer
  también el `DELETE` ya hecho.
- `PATCH /api/organismos/:id` con confirmación (FR-020): `DELETE` de las
  respuestas huérfanas + `UPDATE` del tipo del organismo, atómicamente.

**Decisión**: un helper mínimo, `backend/src/db/transaction.ts`:

```ts
export async function conTransaccion<T>(pool: pg.Pool, fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const resultado = await fn(client)
    await client.query('COMMIT')
    return resultado
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}
```

Usado por ambos handlers en vez de repetir `pool.connect()`/`BEGIN`/`COMMIT`/`ROLLBACK`/`release` dos veces.

**Rationale**: es el patrón estándar de `pg` (node-postgres) para
transacciones multi-sentencia — no hay una alternativa idiomática
distinta. Un helper compartido evita duplicar el manejo de errores
(`ROLLBACK` en el `catch`, `release` en el `finally`) exactamente en los
dos únicos lugares de todo el backend que lo van a necesitar; no es una
abstracción prematura porque ya hay dos llamadores reales dentro de esta
misma feature, no uno hipotético.

**Alternatives considered**: repetir el `BEGIN`/`COMMIT`/`ROLLBACK` en
cada handler — descartado, duplicaría manejo de errores idéntico en los
dos únicos lugares que lo usan, sin ganar nada a cambio.

---

## Decisión 4 — Cómo distinguir un rechazo de trigger de un error de servidor genérico: SQLSTATE `P0001`, verificado contra la base real

**El riesgo (D11)**: hoy, cualquier error de Postgres que llegue sin
capturar hasta el handler de errores por defecto de Fastify se convierte
en un 500 genérico — es exactamente la causa raíz de que `PUT` taxonomía
rompiera en silencio (nadie distinguía "columna inexistente" de "el
trigger rechazó esto a propósito").

**Verificado empíricamente** (no asumido): un `RAISE EXCEPTION 'mensaje'`
simple, sin `USING ERRCODE`, como los que ya usan
`validar_respuesta_taxonomia()` y `validar_opcion_tipo_pregunta()`, produce
siempre el mismo `SQLSTATE`:

```sql
-- corrida real contra la base, disparando el trigger de 003:
NOTICE:  SQLSTATE real: P0001
```

**Decisión**: un helper pequeño, usado SOLO por las rutas que esta feature
toca (no un `setErrorHandler` global de Fastify — ver más abajo):

```ts
// src/http/trigger-error.ts
export function esRechazoDeTrigger(err: unknown): err is { code: 'P0001'; message: string } {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P0001'
}
```

En cada handler que puede disparar un trigger de taxonomía:

```ts
try {
  // ... dentro de conTransaccion ...
} catch (err) {
  if (esRechazoDeTrigger(err)) {
    return reply.code(400).send({ error: err.message })
  }
  throw err  // cualquier otra cosa sigue siendo un 500 genuino
}
```

**Rationale**:
- `P0001` es el código genérico de "raise_exception" de Postgres cuando no
  se especifica un `SQLSTATE` propio — exactamente lo que emiten todos los
  triggers de integridad de este proyecto (`001`, `003`, y la Protección A
  de esta feature), verificado contra la base real, no asumido de la
  documentación de Postgres.
- **400, no 409 ni 422**: este backend no usa ningún código de estado más
  allá de `400` (validación de esquema de Fastify), `403`, `404` y los
  `2xx` — no hay precedente de `409`/`422` en ningún endpoint existente.
  Introducir uno nuevo solo para esta feature ampliaría el vocabulario de
  estados HTTP del proyecto sin necesidad: un rechazo de trigger es, en
  esencia, la misma categoría de error que un cuerpo de pedido inválido
  ("tal como lo mandaste, no se puede aplicar") que Fastify ya devuelve
  como `400`.
- **Helper local, no `app.setErrorHandler` global**: el spec de esta
  feature (`Fuera de alcance explícito`) es literal en que "cualquier
  cambio a otro endpoint... queda fuera de alcance sin excepción". Un
  `setErrorHandler` global cambiaría el comportamiento de *cualquier* ruta
  que alguna vez dispare un `P0001` (por ejemplo, el trigger de
  `001-modelo-datos-relacional` sobre asignación de fueros, si algún
  endpoint futuro lo tocara) — un cambio de comportamiento compartido que
  esta feature no pidió ni necesita para cumplir su propio alcance. El
  helper local logra el mismo resultado exactamente donde hace falta, sin
  ese efecto lateral.

**Alternatives considered**:
- **`app.setErrorHandler` global**: descartado por el motivo de alcance de
  arriba — no porque sea peor en abstracto (de hecho sería la elección
  correcta si el objetivo fuera "todos los triggers del proyecto deben
  traducirse siempre", una mejora real pendiente, pero de otra feature).
- **Inspeccionar el texto del mensaje** (`err.message.includes(...)`) en
  vez del `SQLSTATE`: descartado — más frágil (un cambio de redacción en
  el mensaje del trigger rompería la detección), cuando `SQLSTATE` ya da
  una señal exacta y estable.

---

## Decisión 5 — Forma de los datos: preguntas y opciones por código, agrupadas por pregunta

**Decisión**: confirma y detalla la Assumption ya registrada en spec.md.

- `GET` devuelve un array, un elemento por pregunta respondida:
  ```json
  [
    { "pregunta": { "codigo": "autonomia", "texto": "autonomia", "grupo": "gestion", "tipoRespuesta": "opcion_unica" },
      "opciones": [{ "codigo": "A", "etiqueta": "..." }] },
    { "pregunta": { "codigo": "grado_implementacion", "texto": "grado_implementacion", "grupo": "implementacion", "tipoRespuesta": "opcion_unica" },
      "opciones": [{ "codigo": "B", "etiqueta": "..." }] }
  ]
  ```
  Para `numerica`/`texto_libre`, el elemento trae `"valorNumero"`/`"valorTexto"` en vez de `"opciones"`.
- `PUT` acepta `{ "respuestas": [ { "preguntaCodigo": "...", "opcionesCodigos": ["..."] } | { "preguntaCodigo": "...", "valorNumero": ... } | { "preguntaCodigo": "...", "valorTexto": "..." } ] }`.
  `opcionesCodigos` es siempre un array (de 1 elemento para `opcion_unica`,
  de 1 o más para `opcion_multiple`) — una sola forma para "esta pregunta
  se responde con opciones", sin un campo singular aparte para el caso de
  una sola opción.

**Rationale**: sigue la convención ya usada en todo `003` (código estable
como identificador público, nunca el id interno) y el patrón "array plano
para colecciones, objeto plano para un solo recurso" que ya usan `GET
/api/organismos` (array) y `GET /api/organismos/:id` (objeto) en este
mismo archivo de rutas — coherente con el resto de la API, sin inventar
una convención nueva.

**Alternatives considered**: un objeto indexado por código de pregunta
(`{ "autonomia": {...}, ... }`) en vez de un array — descartado, porque
"array de entradas, cada una con su clave adentro" es la forma que ya usan
las demás colecciones de esta API (nunca un objeto-diccionario), y permite
al cliente iterar sin conocer de antemano qué preguntas van a estar
presentes.
