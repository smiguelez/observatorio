# Resultado de verificación — 007 identidad y autorización (2026-09-25)

Verificación de punta a punta de `007-identidad-autorizacion` contra la base real (`observatorio`, mismo motor que `002`–`006`) y contra un servidor
Fastify **real** levantado con `tsx src/app.ts` (puerto 3055, `BETTER_AUTH_URL=http://localhost:3055`), manejado con `curl`. Los tokens y cookies
de sesión se redactaron en este documento; eran de usuarios de prueba (`test-live-*`) ya eliminados.

## 1. Resumen

| Verificación | Resultado |
|---|---|
| Spike `scripts/spike-007-identidad.ts` (test de humo de `better-auth@1.7.5`) | **19/19 casos PASS**, 0 filas de prueba restantes |
| Suite `backend/` (`npx vitest run`, base real, sin mocks) | **28 archivos, 197 tests, todos pasan** (línea base previa a `007`: 19 archivos, 105 tests) |
| `tsc --noEmit` | limpio |
| Migración `0004_taxonomia_mensajes_legibles` | aplicada (`migrate:public`); `up`/`down` probados en transacciones descartables |
| Estado de la base tras todo | `usuarios`=47, admins=3, 0 filas `test-%` en `usuarios`/`auth.user`/`organismos`/`grupos_jueces`, 0 `reset-password:*` residuales, 0 esquemas de prueba |
| Servidor real (18 escenarios de `quickstart.md`) | ver §2 (Google solo con doble de prueba: requiere navegador real) |

## 2. Escenarios contra el servidor real

Salida literal de `live.sh` (redactada):

```
== 1. Alta pública cerrada
sign-up email nuevo: 400 {"message":"Email and password sign up is not enabled","code":"EMAIL_PASSWORD_SIGN_UP_DISABLED"}
filas usuarios/auth.user con ese email: 0|0
sign-up sobre email dado de alta sin ingresar (toma de cuenta 2026-09-25): 400 {"message":"Email and password sign up is not enabled","code":"EMAIL_PASSWORD_SIGN_UP_DISABLED"}
login del atacante: 401 {"message":"Invalid email or password","code":"INVALID_EMAIL_OR_PASSWORD"}
== 3. Pedido de enlace: indistinguible
provisionado: 200 {"status":true}
NO provisionado: 200 {"status":true}
verificaciones para el fantasma: 0  | para el provisionado: 1
== 4/5. Migrado ingresa por enlace (mayúsculas y espacios en el pedido)
verify: 200 {"token":"<redactado>","user":{"name":"","email":"test-live-migrado@example.observatorio.test","emailVerified":true,"image":null,"createdAt":"…","updatedAt":"…","id":"2211"} …
usuarios.id=2211 auth.user.id=2211 copias en usuarios=1
== 10. Alta administrada + primer acceso
POST /api/usuarios: 201 {"id":"2212","email":"test-live-alta@example.observatorio.test","provinciaId":3,"roles":["usuario_normal"],"accesoInicial":{"token":"<redactado>","vence":"2026-09-26T16:54:23.120Z"}}
canje: 200 {"usuarioId":"2212"} set-cookie=1
sesión (usuarioId/rol/provincia): 200 {"usuarioId":"2212","rol":"usuario_normal","provinciaId":3}
login por contraseña: 200 {"redirect":false,"token":"<redactado>","user":{"name":"test-live-alta@example.observatorio.test","email":"test-live-alta@example.observatorio.test","emailVerified":true,"image":null,"createdAt":"…","updatedAt":"…"error":"El acceso inicial no es válido o venció."} …
reemitir: 201 {"token":"<redactado>","vence":"2026-09-26T16:54:23.634Z"}
canje con el nuevo: 200 {"usuarioId":"2212"}
== 12. Datos inválidos
email duplicado: 400 {"error":"Ese email ya está dado de alta."}
normal sin provincia: 400 {"error":"La provincia es obligatoria para un usuario normal."}
provincia inexistente: 400 {"error":"La provincia indicada no existe."}
sin sesión: 401 {"error":"No autenticado"}
== 6/7/8. Provincia solo admin (usuario nuevo con su sesión)
cambia su provincia (3→4): 403 {"error":"La provincia de un usuario solo la puede asignar un administrador."}
nombre en base: <null> / prov 3
reenvía su provincia actual + nombre: 200 {"id":"2212","email":"test-live-alta@example.observatorio.test","nombre_display":"Nombre nuevo","provincia_id":3,"foto_url":null}
admin le asigna 6: 200 {"id":"2212","email":"test-live-alta@example.observatorio.test","nombre_display":"Nombre nuevo","provincia_id":6,"foto_url":null}
== 9. Rol
normal intenta ascenderse: 403 {"error":"Solo un administrador puede cambiar el rol de un usuario."}
admin lo asciende: 200 {"id":"2212","roles":["usuario_normal","admin"]}
su MISMA cookie ahora es admin (siguiente solicitud): 200 {"usuarioId":"2212","rol":"admin","provinciaId":6}
admin lo degrada: 200 {"id":"2212","roles":["usuario_normal"]}
admins reales (siguen 3 + el admin de esta prueba): 4
== 14/15. Cambio de contraseña
login 2.ª sesión: ok
actual incorrecta: 400 {"message":"Invalid password","code":"INVALID_PASSWORD"}
nueva corta: 400 {"message":"Password too short","code":"PASSWORD_TOO_SHORT"}
cambio ok: 200
cookie nueva sigue activa: 200 {"usuarioId":"2212","rol":"usuario_normal","provinciaId":6}
cookie anterior (la de donde se cambió): 401 {"error":"No autenticado"}
otra sesión (canje): 401 {"error":"No autenticado"}
contraseña vieja: 401 {"message":"Invalid email or password","code":"INVALID_EMAIL_OR_PASSWORD"}
contraseña nueva: 200 {"redirect":false,"token":"<redactado>"message":"Credential account not found","code":"CREDENTIAL_ACCOUNT_NOT_FOUND"}
== 16. Errores de integridad
DELETE pool en uso: 400 {"error":"El pool está asignado a unidades funcionales; quitalo de esas asignaciones antes de eliminarlo."}
pool sigue existiendo: 1
UF con localidad inexistente: 400 {"error":"La localidad indicada no existe."}
organismo con tipoOficinaId inexistente: 400 {"error":"El tipo de oficina indicado no existe."}
== 17. Taxonomía identificable
pregunta que no aplica al tipo: 400 {"error":"La pregunta «autonomia» no aplica al tipo de organismo actual.","preguntaCodigo":"autonomia","preguntaTexto":"autonomia"}
opción ajena: 400 {"error":"La opción «ZZZ» no existe para la pregunta «autonomia».","preguntaCodigo":"autonomia","preguntaTexto":"autonomia"}
dos respuestas a pregunta única: 400 {"error":"La pregunta «autonomia» admite una sola respuesta.","preguntaCodigo":"autonomia","preguntaTexto":"autonomia"}
valor de otro tipo: 400 {"error":"La pregunta «autonomia» admite una opción; se recibió un valor de otro tipo.","preguntaCodigo":"autonomia","preguntaTexto":"autonomia"}
```

**Escenario 18 (el acceso inicial no se loguea)** — sobre las 217 líneas de log del servidor real durante la corrida: los dos tokens de acceso
inicial y las cinco contraseñas usadas aparecen **0** veces; el canje figura solo como método/URL/estado. El enlace de magic link (log preexistente
de `002`, Fase C) se registró solo para el email dado de alta (0 líneas para el email no dado de alta).

**Escenarios cubiertos solo por tests automáticos** (no por el servidor real): Google (`sign-in/social` con `idToken`: una instancia de Better Auth
armada en el test usa el hook de producción con `verifyIdToken` de prueba; el flujo real requiere navegador y credenciales de Google), la carrera de
los dos últimos administradores (esquema aislado, 25 iteraciones; con el `FOR UPDATE` quitado el test falla), canje simultáneo, vencimiento por
`expiresAt`, y el resto de las restricciones del mapa de integridad.

## 3. Evidencia de que los tests detectan los defectos (pruebas de mutación manuales)

- Sin `disableSignUp`/hook: el alta pública sobre un email dado de alta respondía `200` con sesión (el ataque del 2026-09-25 se reprodujo antes de implementar).
- Sin `FOR UPDATE` en `cambiarRol`: la carrera deja dos degradaciones exitosas (0 administradores) → el test falla; con el bloqueo pasa.
- Con el manejador central desactivado: los dos `500` de `005` (pool en uso, UF con localidad inexistente) y otros dos casos vuelven a ser `500` (4 tests fallan).
- Con un `log.info` del token agregado a propósito: el test de logs falla.

## 4. Hallazgos y desvíos (registrados, no silenciados)

1. **`tasks.md` T005 se absorbió en T012**: quitar solo el `INSERT INTO usuarios` sin rechazar era inseguro; `identity-hook.ts` se reemplazó por `identidad-hook.ts`.
2. **T014**: el pedido de enlace se corta en un `hooks.before` (no en `sendMagicLink`): así ni siquiera se crea la fila en `auth.verification` para un email no dado de alta.
3. **T019**: la regla de provincia vive en `actualizarUsuario` (transacción con `FOR UPDATE`), no en una función `asignarProvincia`.
4. **Fuga de tokens en los tests**: mis primeros tests dejaban filas `reset-password:*` (el helper de limpieza buscaba por email y esas filas guardan el id). Corregido en `limpiarUsuariosDePrueba`; se borraron 8 filas huérfanas de mis pruebas.
5. **Bug de orden de prueba encontrado**: `limpiarPoolsDePrueba` no podía borrar un pool con asignaciones (FK sin cascade) si un test fallaba a mitad; ahora borra antes las asignaciones.
6. **Migración `0004`**: la función auxiliar usa `CREATE FUNCTION` (no `OR REPLACE`); no se editó después de aplicada (regla del proyecto); los tests parten de `down()` para ser repetibles.
7. **Lint**: `eslint .` reporta 21 errores `no-explicit-any` en los 3 scripts `spike-007-*.ts` (escritos antes de esta implementación) y en `tests/contract/taxonomia-preguntas.test.ts` (preexistente); ningún archivo nuevo de `007` los tiene. No se corrigieron.
8. **Deuda ya conocida que sigue abierta**: rate limiting del canje y del login (D10, Fase E); `POST /api/auth/reset-password` de Better Auth sigue alcanzable con el mismo token; el token queda en claro en `auth.verification` (riesgo aceptado en `plan.md`).
9. **Frontend (fuera de alcance)**: `frontend/tests/e2e/helpers/backend.ts` (`crearUsuarioConClave`) usa `sign-up/email` (línea 42) y dejará de funcionar; documentado en `contracts/api.md` §5 para la Fase B. No se modificó `frontend/`.
