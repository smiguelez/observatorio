# Data Model: identidad y autorización (007)

Feature `007-identidad-autorizacion`. **No introduce tablas ni columnas.**
Documenta cómo se usan las existentes (de `001` y de Better Auth), las reglas de
cada operación nueva, los estados por los que pasa un usuario, y el único
cambio de esquema (`0004`, de funciones).

## Tablas usadas

### `public.usuarios` — quién puede entrar (fuente de verdad)

| Columna | Uso en 007 |
|---|---|
| `id bigint` (identidad) | Es también `auth."user".id` (como texto): lo fija el hook de id |
| `email citext UNIQUE NOT NULL` | Clave del hook de ingreso. Se **normaliza** (minúsculas, sin espacios) al comparar y al guardar. Un email = un usuario (FR-006) |
| `provincia_id smallint NULL → provincias` | **Escribe solo un admin** (FR-008). `NULL` permitido para admin |
| `email_verificado boolean` | `true` en el alta administrada (el admin avala el email); espejo de `auth.user.emailVerified` |
| `nombre_display`, `foto_url` | Sin cambios; los edita el propio usuario (sin impacto de autorización) |
| `firestore_id text UNIQUE NOT NULL` | En altas nuevas: `api:<uuid>` (misma convención que organismos/UF) |

Lo que **cambia**: el hook de `002` dejaba de ser fuente de altas — hoy hacía
`INSERT INTO usuarios` ante cualquier email nuevo; deja de hacerlo. **Solo** las
crea el servicio de alta administrada.

### `public.usuario_roles` / `public.roles`

`roles` = {`admin`, `usuario_normal`}. Invariante (verificada: 47 de 47 usuarios):
**todo usuario tiene la fila `usuario_normal`**; un admin tiene además la fila
`admin`. "Cambiar el rol" = agregar/quitar la fila `admin`. La identidad del
solicitante (`rol`) sale de esa fila **en cada solicitud** (sin cache).
Regla nueva: **nunca 0 filas `admin`** (bloqueo `FOR UPDATE` + conteo dentro de la
transacción).

### `auth."user"`, `auth.account`, `auth.session` (Better Auth)

| Tabla | Uso en 007 |
|---|---|
| `auth."user"` | Una fila por persona que ya ingresó **o** fue dada de alta por un admin. `id = usuarios.id::text`, `email` en minúsculas, `emailVerified = true` cuando la crea el alta administrada. El alta administrada la inserta **por SQL** en la misma transacción que `usuarios` |
| `auth.account` | `providerId = 'credential'` (contraseña) o `'google'`. La credencial **nace** en el canje del acceso inicial o al cambiar la contraseña; ya no por alta pública |
| `auth.session` | Sin cambios; al cambiar la contraseña se revocan **todas** y se crea una nueva |

### `auth.verification` — el "acceso inicial"

Sin tabla propia. Cada acceso inicial es **una fila**:

| Campo | Valor |
|---|---|
| `identifier` | `reset-password:<token>` (formato que espera el canje de Better Auth) |
| `value` | `auth."user".id` del usuario destinatario |
| `expiresAt` | ahora + `ACCESO_INICIAL_TTL_HORAS` (default 24 h) |

Reglas: **un solo uso** (el canje consume la fila de forma atómica); **un solo
acceso vigente por usuario** (emitir borra los `reset-password:*` previos de ese
`value`); vence solo. El token es aleatorio de alta entropía. El identificador
queda en claro en la tabla (riesgo aceptado, plan.md).

## Validaciones por operación

| Operación | Reglas |
|---|---|
| **Alta administrada** | solo admin · email con formato válido y no existente · `rol ∈ {admin, usuario_normal}` · `provinciaId` **obligatoria** si el rol es `usuario_normal`, opcional si es `admin` · la provincia, si viene, existe |
| **Emitir acceso inicial** | solo admin · el usuario existe · reemite: invalida el anterior |
| **Canjear acceso inicial** | contraseña ≥ mínimo de la política (8) **antes** de mirar el token (respuestas uniformes) · token vigente y no usado · crea/actualiza la credencial · inicia sesión |
| **Cambiar rol** | solo admin · el usuario existe · rol válido · **no** dejar el sistema sin admins (incluye el autodescenso del último) |
| **Provincia** | escribe solo admin; no admin ⇒ `403` si el valor **difiere** del actual (o el destino no es él); igual al actual ⇒ no es cambio; provincia inexistente ⇒ `400` |
| **Hook de ingreso** | email normalizado ∈ `usuarios`; si no, rechazo uniforme (sin revelar existencia) |
| **Cambiar contraseña** | sesión válida · contraseña actual correcta · nueva ≥ política · revoca todas las sesiones y entrega una nueva |

## Estados de un usuario

```
                (admin: POST /api/usuarios)
   ── no existe ───────────────────────────────▶ DADO DE ALTA, SIN CREDENCIAL
                                                  (usuarios + usuario_roles + auth.user; sin auth.account)
                                                          │
                     acceso inicial emitido  ◀────────────┤────────────▶ ingresa por Google / enlace
                     (auth.verification)                  │              (crea auth.account 'google' o nada; sin contraseña)
                             │                            │
                canje (POST /canjear)                     │
                             ▼                            │
                CON CONTRASEÑA (auth.account credential) ─┘  (los tres métodos conviven; FR-020)
                             │
        reemitir acceso inicial (admin) ──▶ nuevo token; el anterior deja de servir; puede fijar otra contraseña
```

Los **47 usuarios migrados** arrancan en "dado de alta, sin credencial" **sin**
fila en `auth."user"`: su `auth.user` se crea en su primer ingreso por Google o por
enlace (el hook lo permite porque están en `usuarios`; el hook de id le da el
mismo `id`). Por eso `disableSignUp` por método **no** sirve (research, Decisión 1).

## Configuración

| Variable | Default | Uso |
|---|---|---|
| `ACCESO_INICIAL_TTL_HORAS` | `24` | vencimiento del acceso inicial |
| `BETTER_AUTH_URL` | (obligatoria, ya documentada) | origen confiable; también base de la URL de acceso inicial que arma el frontend |

Sin secretos nuevos.

## Migración `0004_taxonomia_mensajes_legibles` (única)

Patrón de `0001`–`0003` (`up`/`down`; una migración aplicada no se edita).
**Solo reemplaza funciones** (`CREATE OR REPLACE FUNCTION`), no toca tablas ni datos:

| Función | Cambio |
|---|---|
| `validar_respuesta_taxonomia()` (0001) | los `RAISE EXCEPTION` nombran la pregunta por su **rótulo** (`codigo`, más `texto` si difiere) y no incluyen `pregunta_id`/`opcion_id`; cada uno agrega `USING DETAIL = 'preguntaCodigo=<codigo>'` |
| `validar_pregunta_tipo_organismo()` (0003) | ídem: "la pregunta «X» no aplica al tipo de organismo actual", sin ids ni `tipo_oficina_id` |
| *(nueva, auxiliar)* `taxonomia_pregunta_rotulo(pregunta_id)` | devuelve el rótulo legible de una pregunta (evita repetir el formato) |

`down` restaura las definiciones de `0001` y `0003`. La función de `0002`
(`taxonomia_opciones`) no la alcanza el cliente y **no se toca**.

**Sin datos migrados** ⇒ el Principio X (reconciliación) no aplica; se valida con
las pruebas de contrato de mensajes.

## Lo que NO cambia

`grupos_jueces`, `unidades_funcionales`, `organismos`, `evaluaciones_taxonomicas`
y sus FK (solo cambia cómo se **informa** su violación). El casing y la
serialización de ids (D13/D17) tampoco.
