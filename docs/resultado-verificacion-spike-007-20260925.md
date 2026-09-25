# Resultado del spike de `007-identidad-autorizacion` (2026-09-25)

Script: `backend/scripts/spike-007-identidad.ts` (mismo patrón que el spike T007 de `002`). Corre **contra la base
real y `better-auth@1.7.5`**, con su propia instancia de Better Auth (no modifica `backend/src/`), y crea datos con
prefijo `test-007-spike-` que borra al empezar y al terminar. Comando:

```bash
cd backend && BETTER_AUTH_URL=http://localhost:5173 DATABASE_URL=... BETTER_AUTH_SECRET=... \
  GOOGLE_CLIENT_ID=x GOOGLE_CLIENT_SECRET=x npx tsx scripts/spike-007-identidad.ts
```

Salida real de la corrida (19 de 19 casos; recortada a la línea de resultado de cada caso):

```
PASS  E1 router: POST /sign-up/email con disabledPaths  — status 404
PASS  A1 contraseña, NO provisionado: rechazado por la compuerta, 0 filas  — 403 ACCESO_NO_AUTORIZADO No se pudo iniciar sesión con este email.
PASS  A2 contraseña, provisionado por server API: la compuerta lo PERMITE (por eso E1 es imprescindible)  — user.id=1397 usuarios.id=1397
PASS  A3 enlace, NO provisionado: verify redirige con error y 0 filas  — 302 http://localhost:5173/login?error=ACCESO_NO_AUTORIZADO&error_description=No+se+pudo+iniciar+sesi%C3%B3n+con+este+email.
PASS  A4 enlace, provisionado (sin auth.user previo): crea identidad con id = usuarios.id y sesión  — auth.user.id=1398 usuarios.id=1398 emailVerified=true
PASS  A5 Google, NO provisionado: rechazado y 0 filas  — 403 {"code":"ACCESO_NO_AUTORIZADO","message":"No se pudo iniciar sesión con este email."}
PASS  A6 Google, provisionado: entra con id = usuarios.id  — 200 auth.user.id=1399 usuarios.id=1399
PASS  A7 ningún intento rechazado dejó filas en usuarios (solo los 3 provisionados a mano)  — n=3
PASS  B1 canjear el token fija la contraseña de un usuario SIN credencial (crea la cuenta credential)  — 200 cuentas=1
PASS  B2 el mismo token no sirve dos veces  — 400 INVALID_TOKEN
PASS  B3 un token vencido no sirve  — 400 INVALID_TOKEN
PASS  B4 dos canjes simultáneos: exactamente uno tiene efecto  — 200,400
PASS  B5 tras los canjes, ingresa con la contraseña que ganó la carrera (y no con la primera)  — primera=401 c1=200 c2=401
PASS  B6 la política mínima de contraseña también aplica al canje  — 400 PASSWORD_TOO_SHORT
PASS  C1 (FR-020) ingresar luego por enlace NO borra la contraseña (emailVerified=true)  — 302 cuentas=1 200
PASS  C2 contraste: con emailVerified=false el enlace SÍ borra la contraseña (lo que hay que evitar)  — cuentas=0
PASS  D1 el cambio (sin pedir revokeOtherSessions) deja activa la sesión actual y cierra la otra  — cambio=200 actual(nueva cookie)=true cookie previa=false otra=false
PASS  D2 la contraseña anterior deja de servir  — 401
PASS  E2 disableSignUp cierra el alta por HTTP Y por la API de servidor (aun con email provisionado)  — http=400 api=400 EMAIL_PASSWORD_SIGN_UP_DISABLED (usuarios.id=1403)
19/19 casos PASS
filas de prueba restantes: 0
```

Preguntas que respondió (detalle y decisiones en `specs/007-identidad-autorizacion/research.md`):

- **A** — `user.databaseHooks.user.create.before` (compuerta nativa de Better Auth) rechaza el alta por **los tres métodos** y
  deja **0 filas**; convive con el `databaseHooks.user.create.before` que fija `auth.user.id = usuarios.id`.
- **B/C** — un token `reset-password:<token>` creado por el servidor con vencimiento propio sirve como acceso
  inicial: de un solo uso, atómico ante canjes simultáneos, con vencimiento, con la política mínima de contraseña,
  y crea la credencial de un usuario que no la tenía; y la contraseña **sobrevive** a un ingreso posterior por
  enlace si el `auth.user` tiene `emailVerified = true` (con `false` la borra: caso C2).
- **D** — `hooks.before` permite forzar `revokeOtherSessions` en el servidor al cambiar la contraseña; Better Auth
  revoca **todas** las sesiones, crea una nueva y la entrega en `Set-Cookie` (la cookie de la sesión actual rota).
- **E** — `emailAndPassword.disableSignUp: true` cierra el alta pública **por HTTP (400) y por la API de servidor**,
  incluso para un email ya provisionado (sin ese cierre, A2 muestra que la compuerta lo permitiría: es la toma
  de cuenta que el spec describe). `disabledPaths` (E1, 404 en el router) también funciona pero **no** cubre la
  API de servidor.
- Un tropiezo repetido de `002`: `INSERT ... VALUES ($1, $1)` sobre `email citext` + `firestore_id text` falla con
  `inconsistent types deduced for parameter $1`; hay que pasar dos parámetros.


## Comparación: el `before`-hook por sí solo (`backend/scripts/spike-007-hook-only.ts`)

Misma base real, `better-auth@1.7.5`. El mismo `databaseHooks.user.create.before` probado con dos desenlaces, en los tres métodos:

```

=== Variante: el before-hook LANZA APIError(FORBIDDEN, {code}) ===
  contraseña : {"ok":false,"status":403,"code":"ACCESO_NO_AUTORIZADO","msg":"No se pudo iniciar sesión con este email."} {"usuarios":0,"authUser":0}
  enlace     : 302 http://localhost:5173/login?error=ACCESO_NO_AUTORIZADO&error_description=No+se+pudo+iniciar+sesi%C3%B3n+con+este+email. {"usuarios":0,"authUser":0}
  google     : 403 {"code":"ACCESO_NO_AUTORIZADO","message":"No se pudo iniciar sesión con este email."} {"usuarios":0,"authUser":0}
  ctx.path que ve el hook en cada creación: ["/sign-up/email","/magic-link/verify","/sign-in/social"]

=== Variante: el before-hook DEVUELVE false ===
  contraseña : {"ok":false,"status":400,"code":"FAILED_TO_CREATE_USER","msg":"Failed to create user"} {"usuarios":0,"authUser":0}
  enlace     : 302 http://localhost:5173/login?error=failed_to_create_user {"usuarios":0,"authUser":0}
  google     : 401 {"message":"unable to create user","code":"OAUTH_LINK_ERROR"} {"usuarios":0,"authUser":0}
  ctx.path que ve el hook en cada creación: ["/sign-up/email","/magic-link/verify","/sign-in/social"]

filas de prueba restantes: 0
```

## Coexistencia de las dos protecciones (`backend/scripts/spike-007-coexistencia.ts`)

Mismo before-hook, sin `disabledPaths`, mismo ataque; solo cambia `emailAndPassword.disableSignUp`. X = alta pública por contraseña de un email **no** provisionado (D14). Y = alta pública por contraseña de un email **ya provisionado** que aún no tiene `auth.user` (caso A2, apropiación de cuenta), seguido de un intento de ingreso con la clave del atacante. Los contadores son `{usuarios, authUser, credencial}`.

```

===== disableSignUp: false =====
  estado inicial provisionado: {"usuarios":1,"authUser":0,"credencial":0}
  X  (D14) HTTP sign-up email NO provisionado : {"status":403,"code":"ACCESO_NO_AUTORIZADO","hasUser":false} {"usuarios":0,"authUser":0,"credencial":0}
  X  (D14) server API sign-up NO provisionado : 403 ACCESO_NO_AUTORIZADO {"usuarios":0,"authUser":0,"credencial":0}
  Y  (A2)  HTTP sign-up email PROVISIONADO    : {"status":200,"hasUser":true} {"usuarios":1,"authUser":1,"credencial":1}
  Y  (A2)  server API sign-up PROVISIONADO    : 422 USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL {"usuarios":1,"authUser":1,"credencial":1}
  Y  el atacante inicia sesión con su clave    : {"status":200,"hasUser":true} <-- CUENTA TOMADA

===== disableSignUp: true =====
  estado inicial provisionado: {"usuarios":1,"authUser":0,"credencial":0}
  X  (D14) HTTP sign-up email NO provisionado : {"status":400,"code":"EMAIL_PASSWORD_SIGN_UP_DISABLED","hasUser":false} {"usuarios":0,"authUser":0,"credencial":0}
  X  (D14) server API sign-up NO provisionado : 400 EMAIL_PASSWORD_SIGN_UP_DISABLED {"usuarios":0,"authUser":0,"credencial":0}
  Y  (A2)  HTTP sign-up email PROVISIONADO    : {"status":400,"code":"EMAIL_PASSWORD_SIGN_UP_DISABLED","hasUser":false} {"usuarios":1,"authUser":0,"credencial":0}
  Y  (A2)  server API sign-up PROVISIONADO    : 400 EMAIL_PASSWORD_SIGN_UP_DISABLED {"usuarios":1,"authUser":0,"credencial":0}
  Y  el atacante inicia sesión con su clave    : {"status":401,"code":"INVALID_EMAIL_OR_PASSWORD","hasUser":false} (sin acceso)
```

Lectura:
- Sin `disableSignUp`, el hook frena X (D14) pero **no** frena Y: crea `auth.user` + credencial con la clave del atacante y este entra (`200`). El hook no puede frenarlo porque el email sí está provisionado.
- Con `disableSignUp: true`, Y queda en `400 EMAIL_PASSWORD_SIGN_UP_DISABLED` por HTTP y por API de servidor, sin `auth.user` ni credencial, y el ingreso del atacante da `401`.
- En la ruta de contraseña, con `disableSignUp` X lo corta antes el propio `disableSignUp` (el hook ni corre). En enlace y Google el hook es la única barrera: casos A3–A6 del spike principal. Son protecciones complementarias, cada una cubre lo que la otra no.
