# Data Model: Backend/API — autorización y carga de datos

Feature `002-backend-api-carga-datos`. **100% aditivo**: ninguna entidad de
`001-modelo-datos-relacional` se modifica (sin `ALTER TABLE`, sin columnas
nuevas en `usuarios`/`organismos`/etc.). Todo lo nuevo de esta feature vive
en un esquema Postgres separado, `auth`, gestionado por Better Auth
(research.md, Decisión 3).

## Relación con el modelo existente (001, sin cambios)

Esta feature **consume**, no redefine:

- `public.usuarios` (id subrogado, email `citext` único, rol vía
  `usuario_roles`, provincia) — es la identidad canónica (Principio V).
- `public.organismos` (`propietario_id`, `estado_fueros`) +
  `public.organismo_editores` — base de FR-012/FR-013.
- `public.unidades_funcionales`, `public.evaluaciones_taxonomicas` — base
  de FR-014 (autorización heredada del organismo padre).
- `public.grupos_jueces` (`provincia_id`) — base de FR-015.
- `public.localidades` — base de FR-018/FR-019.
- `public.roles`, `public.usuario_roles` — de dónde sale "es admin" para
  toda regla de arriba.

Ninguna de estas tablas gana una columna nueva en esta feature.

## Entidades nuevas (esquema `auth`, gestionado por Better Auth)

Estas tablas las genera y migra la propia librería (Decisión 2/3 de
research.md); se documentan acá por su rol conceptual y su vínculo con
`usuarios`, no como DDL a mano — el DDL exacto lo emite el CLI de Better
Auth contra el esquema `auth` en tiempo de implementación.

### `auth.user`

Representación interna de Better Auth de "alguien que puede autenticarse".
**No es una segunda identidad**: su `id` se fija, en creación, al valor de
`usuarios.id` (como string) vía `databaseHooks.user.create.before` — ver
research.md Decisión 3. Campos propios de la librería (`email`,
`emailVerified`, `name`, `image`, timestamps) son bookkeeping de
autenticación, no reemplazan los atributos de dominio de `usuarios`
(`provincia_id`, `firestore_id`, etc.), que siguen viviendo solo en
`public.usuarios`.

- **Relación con el modelo existente**: `auth.user.id` (string) ==
  `String(public.usuarios.id)` (bigint) para la misma persona — una
  conversión de tipo, no una FK real entre esquemas administrados por
  sistemas distintos (Better Auth no conoce `public.usuarios`; el hook es
  el único punto donde ambos mundos se tocan).

### `auth.account`

Un método de autenticación vinculado a un `auth.user`: credencial local
(contraseña con hash scrypt — Decisión 2) o cuenta de Google (OAuth). Un
mismo `auth.user` puede tener más de una fila acá — es el mecanismo nativo
de Better Auth para "múltiples métodos, misma identidad" (Principio V, FR-009).

- **Validación de negocio (FR-010)**: vincular una segunda cuenta a un
  `auth.user` existente exige verificación de propiedad del email antes de
  habilitarla — se configura en el flujo de "account linking" de Better
  Auth, no se implementa a mano.

### `auth.session`

Sesión activa, persistida (research.md Decisión 4 — no JWT). Referencia a
`auth.user.id`. El id de sesión es lo único que viaja en la cookie
`httpOnly` del cliente.

- **Uso en autorización**: cada request resuelve `cookie → auth.session →
  auth.user.id → Number(...) = usuarios.id`; a partir de ahí, toda regla de
  FR-012 a FR-019 consulta `public.*` con ese `usuarios.id` — nunca con el
  email de la sesión (FR-011).

### `auth.verification`

Tokens de un solo uso: verificación de email y **magic link** (Principio
IV, FR-007). Cada fila tiene una expiración corta (a fijar explícitamente
en implementación — research.md Decisión 5) y se invalida en su primer uso.

## Concepto transversal: "identidad resuelta" (no es una tabla)

No es una entidad persistida, es el resultado de la resolución de sesión
que corre en cada request antes de cualquier chequeo de autorización:

```
IdentidadResuelta {
  usuarioId: bigint          // public.usuarios.id — SIEMPRE, nunca el email
  rol: 'usuario_normal' | 'admin'   // de public.usuario_roles, releído cada request (FR-002)
  provincia: string | null          // de public.usuarios.provincia_id, releído cada request
}
```

Toda función de `authz/` (esOwnerOEditor, mismaProvincia, esAdmin —
Project Structure en plan.md) recibe esta estructura, nunca el objeto de
sesión de Better Auth directamente — así el código de autorización no
depende de la forma interna de la librería de auth, solo de
`IdentidadResuelta`.

## Validaciones de negocio derivadas de los Functional Requirements

| Entidad / relación | Regla | FR |
|---|---|---|
| `organismos` | leer/editar/borrar: propietario, editor, o admin | FR-012 |
| `organismos` | crear: cualquier autenticado, auto-asignado como propietario | FR-013 |
| `unidades_funcionales`, `evaluaciones_taxonomicas` | mismo control que el organismo padre, sin regla propia | FR-014 |
| `grupos_jueces` | leer/crear/editar/borrar: misma provincia que el usuario, o admin | FR-015 |
| `usuarios` (perfil) | editar: propio usuario o admin | FR-016 |
| `usuarios` (perfil) | leer: cualquier autenticado, sin acotar | FR-017 |
| `localidades` | leer: cualquier autenticado; sin alta/edición/borrado por esta API | FR-018/FR-019 |

Ninguna de estas reglas se re-declara en `db/schema.sql` (eso pertenece a
`001-modelo-datos-relacional`, sin cambios); se implementan en `authz/`
como código de aplicación, porque dependen de la sesión (rol/provincia del
usuario actual), que no es algo que una constraint SQL pueda expresar por
sí sola.
