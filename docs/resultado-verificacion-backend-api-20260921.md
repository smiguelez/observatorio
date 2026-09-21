# Verificación de Polish — Backend/API (T040–T042) — 20260921

Feature `002-backend-api-carga-datos`. Corrida contra la base real
(`observatorio`), con el esquema `auth` ya migrado (T007/T009) y las 5
historias de usuario implementadas y probadas (T001–T037, 59/59 tests
automatizados verdes).

## T040 — `public.*` sin cambios tras (re)aplicar las migraciones de `auth`

```bash
psql "$DATABASE_URL" -c "\dt public.*" > /tmp/public-antes.txt
npm run migrate:auth
psql "$DATABASE_URL" -c "\dt public.*" > /tmp/public-despues.txt
diff /tmp/public-antes.txt /tmp/public-despues.txt
```

Salida de `migrate:auth` (esquema ya al día — no era la primera corrida):
```
[migrate:auth] Nada que migrar — el esquema auth.* ya está al día.
```

`diff` entre el `\dt public.*` de antes y después: **sin salida** → 0
diferencias. Las 19 tablas de `public.*` (documentadas en
`specs/001-modelo-datos-relacional/quickstart.md` Paso 1) son exactamente
las mismas antes y después de tocar el esquema `auth`.

## T041 — Hashing de contraseñas: verificado contra la base, no solo contra el código

Se generan reclamos de scrypt en `research.md` (Decisión 2) a partir de leer
el código fuente de Better Auth. Acá se verifica el dato real, persistido,
para un usuario creado por el flujo real (`auth.api.signUpEmail`, el mismo
que usa `POST /api/auth/sign-up/email`):

```bash
npx tsx scripts/verificar-hash-password.ts
```

```
[verificar-hash] Usuario creado: 365
[verificar-hash] providerId: credential
[verificar-hash] Longitud del valor almacenado: 161 caracteres
[verificar-hash] Primeros 20 caracteres: 57ea7a3fe6c9188b7cf2...
[verificar-hash] ¿Es la contraseña en texto plano? false
[verificar-hash] ¿Tiene forma {salt}:{key} (scrypt de Better Auth)? true
[verificar-hash] Segmento salt (primeros 16 chars): 57ea7a3fe6c9188b
[verificar-hash] Longitud del segmento key: 128
[verificar-hash] RESULTADO: OK — hash con salt, no texto plano, formato scrypt.
[verificar-hash] Limpieza: usuario de prueba eliminado.
```

El valor de `auth.account.password` (161 caracteres) **no** coincide con la
contraseña en texto plano usada en el alta (`contrasena-de-verificacion-12345`,
33 caracteres) y tiene la forma `{salt}:{key}` (salt de 32 hex chars, key de
128 hex chars = 64 bytes, consistente con los parámetros de scrypt
documentados en research.md: N=16384, dkLen=64). Confirma SC-008
empíricamente, no solo por lectura de código. Usuario de prueba eliminado
después (`usuarios` de vuelta a 47).

## T042 — Validación end-to-end de `quickstart.md` (Pasos 1–8)

Corrida completa, en orden, con datos nuevos en cada paso:

| Paso | Verificación | Resultado |
|---|---|---|
| 1 | `npm run migrate:auth` — `public.*` sin cambios | Ver T040 arriba |
| 2 | `GET /api/auth/get-session` sin cookie → `200 null`; `GET /api/auth/session` (propia) sin cookie → `401`; `GET /api/organismos` sin cookie → `401` | Los tres exactos — **se corrigió el texto del propio Paso 2**, que decía `401` para `/get-session` (es de Better Auth, no de nuestro hook) |
| 3 | Alta por contraseña (id=366) → `GET /api/auth/get-session` → `userId=366`; magic link mismo email → verify → `userId=366` en la respuesta y en la sesión nueva | Mismo `usuarios.id` en ambos métodos — SC-004 |
| 4 | Reutilizar el token ya consumido del paso 3 | `302` a `http://127.0.0.1/?error=INVALID_TOKEN` — rechazado, no una sesión nueva |
| 5 | A crea organismo (id=431); B (sin relación) lee/edita → ambos `403`; A lee el propio → `200` | Exacto — SC-002 |
| 6 | X (provincia 1), Y (provincia 2) crea pool (id=608) en su provincia; X lee el pool de Y → `403`; Y lee el propio → `200` | Exacto — SC-003. (Nota: en esta corrida hubo que asignar explícitamente la provincia de Y por SQL antes de crear el pool — sin eso, la creación da `403` correctamente por provincia `NULL` ≠ `2`, comportamiento esperado, no un bug) |
| 7 | X lee perfil de Y → `200`; X edita perfil de Y → `403`; X edita el propio → `200` | Exacto — FR-016/FR-017 |
| 8 | `GET /api/localidades` con sesión → `200`; `POST /api/localidades` → `404` (no `403`) | Exacto — FR-018/FR-019 |

**Corrección aplicada a `quickstart.md`** en este pase: el Paso 2 decía que
`GET /api/auth/get-session` sin cookie da `401`; en realidad Better Auth
responde `200` con `null` (es su propia convención para "no hay sesión", no
un error) — corregido para distinguir esa ruta de `/api/auth/session`
(la nuestra, T018) y de las rutas de dominio, que sí dan `401` siempre.

**Limpieza post-corrida**: todos los datos de esta validación (2 organismos,
1 pool, 5 usuarios de prueba con prefijo `qs-`) fueron eliminados. Conteos
finales verificados: `usuarios=47`, `organismos=117`, `grupos_jueces=262`,
`localidades=129` — baseline exacto.

**Suite automatizada** (`npx vitest run`, corrida inmediatamente después de
esta validación manual): `12 test files, 59 tests` — todos verdes.
