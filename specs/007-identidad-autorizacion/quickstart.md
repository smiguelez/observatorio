# Quickstart: validar 007 de punta a punta

Guía de validación, no de implementación. Contrato: `contracts/api.md`; modelo: `data-model.md`;
decisiones y evidencia: `research.md`.

## Prerrequisitos

- Base con `001`–`006` aplicadas y **`0004` aplicada** (`cd backend && npm run migrate:public`).
- Variables del backend (`backend/README.md`): `DATABASE_URL`, `BETTER_AUTH_SECRET`,
  `GOOGLE_CLIENT_ID/SECRET`, **`BETTER_AUTH_URL`** y, nueva, `ACCESO_INICIAL_TTL_HORAS` (opcional, 24).
- Un usuario **admin** de prueba (los 3 admins reales no se tocan): los tests lo crean con el helper nuevo.

## 0. Verificación previa ya hecha (spike)

```bash
cd backend && BETTER_AUTH_URL=http://localhost:5173 DATABASE_URL=... BETTER_AUTH_SECRET=... \
  GOOGLE_CLIENT_ID=x GOOGLE_CLIENT_SECRET=x npx tsx scripts/spike-007-identidad.ts
# Esperado: "19/19 casos PASS" y "filas de prueba restantes: 0"
```
Resultado del 2026-09-25 en `docs/resultado-verificacion-spike-007-20260925.md`. Se conserva como
test de humo de la compatibilidad con Better Auth 1.7.5.

## Escenarios

| # | Escenario | Cómo | Resultado esperado | Prueba |
|---|---|---|---|---|
| 1 | Alta pública cerrada | `POST /api/auth/sign-up/email` con un email nuevo **y** con uno provisionado sin ingresar | `400 EMAIL_PASSWORD_SIGN_UP_DISABLED` en ambos; **0 filas** nuevas; la sonda de toma de cuenta del 2026-09-25 ya no obtiene sesión | SC-001, SC-003, US1-1/5 |
| 2 | Email no provisionado, tres métodos | **contraseña**: el alta ya está cerrada (escenario 1) y un `sign-in/email` de un email sin cuenta no crea nada; **Google** (`sign-in/social` con `idToken`); **enlace** (`sign-in/magic-link` + `verify`) | rechazo uniforme `ACCESO_NO_AUTORIZADO` (Google y enlace); 0 filas en `usuarios`/`auth.user`/`auth.account`/`auth.session` | SC-001, US1-1/2/3 |
| 3 | Pedido de enlace indistinguible | `POST /sign-in/magic-link` con un email provisionado y con uno que no | ambos `200 {status:true}`, misma forma; solo el provisionado deja un enlace utilizable en el log | FR-003 |
| 4 | Migrados ingresan | por enlace y por Google con un usuario provisionado sin `auth.user` | entra con `auth.user.id = usuarios.id`; organismos, rol y provincia intactos; sin duplicar | SC-002, US1-4 |
| 5 | Email con otras mayúsculas/espacios | ingresar con `  Persona@Ejemplo.ORG ` | mismo usuario, no uno nuevo | US1-6 |
| 6 | Provincia solo admin | como usuario normal `PATCH /api/usuarios/:id {provinciaId: otra}` | `403` con mensaje explícito; provincia **y nombre** sin cambios; como admin → `200` | SC-004, US2-1/2/4 |
| 7 | Reenviar la provincia actual | como normal, `PATCH {nombreDisplay:"x", provinciaId:<actual>}` | `200`, nombre cambia, provincia igual | US2-3, FR-010 |
| 8 | Efecto inmediato | admin cambia provincia/rol; el usuario afectado (sesión abierta) consulta pools / usa función de admin | rige en su **siguiente** solicitud, sin re-login | SC-005, US2-5, US3-1/2 |
| 9 | Rol solo admin y último admin | normal `PUT …/rol` → `403`; admin quita el rol al único admin → `400`; dos degradaciones simultáneas de los dos últimos | nunca 0 admins | SC-006, US3-3/4 |
| 10 | Alta administrada + primer acceso | admin `POST /api/usuarios`; `POST /api/acceso-inicial/canjear` con el token y una contraseña | usuario con provincia y rol; queda con sesión; luego ingresa por contraseña; < 5 min sin correo | SC-007, US4-1/2 |
| 11 | Acceso inicial de un solo uso | canjear dos veces (y en paralelo); canjear vencido (`ACCESO_INICIAL_TTL_HORAS` corto); canjear uno reemplazado | solo el primero tiene efecto; el resto `400` uniforme | SC-007, US4-3/6 |
| 12 | Alta duplicada / datos inválidos | `POST /api/usuarios` con email existente, provincia inexistente, rol inválido, usuario normal sin provincia | `400` con mensaje claro; sin filas ni cambios | US4-4/8 |
| 13 | La contraseña sobrevive a otro método | tras (10), ingresar por enlace | la contraseña sigue sirviendo | US4-7, FR-020 |
| 14 | Cambio de contraseña | con 2 sesiones, `POST /api/auth/change-password`; probar la vieja, la nueva y la otra sesión | nueva sirve, vieja `401`, la otra sesión cerrada, la actual con **cookie nueva** | SC-008, US5-1/4 |
| 15 | Sin contraseña / actual errónea / política | `change-password` de un usuario solo-Google; con actual incorrecta; con nueva corta | rechazos claros, sin cambios | US5-2/3/5 |
| 16 | Errores de integridad | `DELETE /api/pools-jueces/:id` con asignaciones; `POST` UF con `localidadId` inexistente; `POST /api/organismos` con `tipoOficinaId` inexistente | `400` con el mensaje del contrato; el pool sigue; 0 `500` | SC-009, US6 |
| 17 | Taxonomía identificable | `PUT` con respuesta a una pregunta que no aplica al tipo; con opción ajena | `400 {error, preguntaCodigo, preguntaTexto}`; el `error` **no** contiene ids ni nombres de tabla (aserción por regex) | SC-010, US7 |
| 18 | El token no se loguea | capturar el log del servidor durante 10–11 | ni el token ni el enlace de acceso inicial aparecen | FR-022 |

## Comandos de prueba

```bash
cd backend
DATABASE_URL=... BETTER_AUTH_SECRET=... GOOGLE_CLIENT_ID=x GOOGLE_CLIENT_SECRET=x \
  npx vitest run                       # contra la base real; cada archivo limpia su prefijo `test-*`
npx tsx scripts/spike-007-identidad.ts # test de humo de Better Auth (19 casos)
```

Los tests limpian con el mismo criterio de prefijo de `backend/tests/helpers/db.ts`
(`limpiarUsuariosDePrueba`); verificar al final `usuarios` = 47 y `auth."user"` sin filas `test-%`.
