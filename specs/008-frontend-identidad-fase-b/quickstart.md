# Quickstart: validar la Fase B de punta a punta

Guía de validación, no de implementación. Contratos: `contracts/consumed-api.md` y `contracts/routes.md`; modelo: `data-model.md`; decisiones y evidencia:
`research.md`. Base de partida (2026-09-25): `vitest` 18 archivos / 152 tests, `tsc -b --noEmit` limpio, Playwright 60 tests en 15 archivos (**hoy rotos** por el alta pública eliminada).

## Prerrequisitos

- Base con `001`–`007` aplicadas (incluida `0004`) y **backend de `007`** corriendo en `:3000` con
  `BETTER_AUTH_URL=http://localhost:5173` (requisito para los `POST` con cookie), `DATABASE_URL`, `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID/SECRET`.
- Frontend en `:5173` (`npm run dev`, proxy `/api → :3000` sin `changeOrigin`).
- `DATABASE_URL` y `psql` disponibles para los E2E (fixtures por prefijo `test-frontend-`; el único arranque por SQL es el admin de fixtures, ver `research.md` Decisión 11).
- **Nunca** correr contra datos de producción; los E2E crean y borran usuarios de prueba en la base real de desarrollo.

## Escenarios

| # | Escenario | Cómo | Resultado esperado | Historia / criterio |
|---|---|---|---|---|
| 1 | Alta administrada | como admin: `/admin/usuarios` → "Dar de alta" con email, rol usuario normal y provincia | aparece el enlace (`/primer-acceso#token=…`), su vencimiento y el aviso de un solo uso; la persona figura en la lista con esa provincia y rol | US1, SC-001 |
| 2 | Validación del alta | usuario normal sin provincia; email inválido; email ya dado de alta | mensajes claros; **0** solicitudes en los dos primeros; el duplicado muestra el texto del servidor | US1-3/4, FR-006 |
| 3 | Cerrar sin copiar | cerrar el paso del enlace sin copiar | pide confirmación; tras cerrar, el enlace no vuelve a mostrarse y no está en el caché de mutaciones | US1-2, FR-003, SC-004 |
| 4 | Canje | abrir el enlace en un contexto **sin sesión**, elegir contraseña y confirmar | entra a `/organismos` con la provincia y el rol asignados; la URL ya no tiene el fragmento; "atrás" no lo recupera | US2-1/2/7, FR-010/013 |
| 5 | Acceso no válido | reabrir el mismo enlace; uno vencido (`UPDATE auth.verification SET "expiresAt"=…`); uno reemplazado; uno inventado; uno **sin** fragmento | **la misma** pantalla y el mismo texto en los cinco; 0 sesiones; sin formulario en el caso sin fragmento | US2-4/5, FR-011, SC-003 |
| 6 | Política de contraseña | corta, larga, confirmación distinta | mensaje que dice qué falta, **antes** de enviar (0 solicitudes) | US2-3, FR-009 |
| 7 | Sesión existente | abrir el enlace con otra sesión abierta | aviso previo de que se reemplaza la sesión; al confirmar, entra la persona invitada | US2-6, FR-014 |
| 8 | Rol | admin promueve y degrada a un usuario; intento de degradar al **último** admin | la lista refleja el rol tras cada éxito; quitar admin pide confirmación; el rechazo del último admin muestra su mensaje y la fila queda en el estado real. *(Para no tocar admins reales el último-admin se verifica con un `page.route` que devuelve el `400` literal de `007` y, aparte, la regla real ya está cubierta por `backend/tests/integration/ultimo-admin.test.ts`.)* | US3-1/2/3, SC-006 |
| 9 | Autodescenso | un admin de fixtures se quita el rol a sí mismo habiendo otro admin | pasa a `/organismos` y ya no ve las pantallas de admin | US3-4, FR-020 |
| 10 | Provincia por admin | admin cambia la provincia de una persona; ella (con la app abierta) navega | en su siguiente pantalla ve la provincia nueva, sin re-login; el alta de organismo la prellena | US3-5/6, SC-007 |
| 11 | Perfil de solo lectura | usuario normal en `/perfil`; admin en `/perfil` | normal: provincia como texto + nota, guardar el nombre funciona y el `PATCH` **no** lleva `provinciaId`; admin: selector editable | US4-1/2/3, SC-005 |
| 12 | Alta de organismo sin provincia | usuario normal sin provincia → `/organismos/nuevo` | "Pedile a un administrador que te asigne una provincia", sin enlace al perfil, sin formulario | US4-4, FR-025 |
| 13 | Recorrido redefinido | admin da de alta con provincia → la persona canjea → alta de organismo + taxonomía | sin elegir provincia, sin recargas, sin reingresar datos | US5, SC-002 |
| 14 | Pool en uso | intentar borrar un pool asignado a una UF | el mensaje del servidor en pantalla y el pool sigue en la lista; luego, sin asignaciones, se borra | US6, SC-008 |
| 15 | Taxonomía identificable | guardar con una pregunta que ya no aplica al tipo (deriva real); otro rechazo sin pregunta (mock) | la pregunta indicada queda resaltada con el mensaje; sin pregunta ⇒ solo el mensaje, sin fallar | US7, SC-009 |
| 16 | Invariantes de la pantalla pública | durante el canje registrar solicitudes, `location`, storage y caché | ninguna contiene el acceso ni la contraseña (`contracts/routes.md`, invariantes 1–5) | SC-004 |
| 17 | Rutas que no existen | `/registro`, `/signup`, `/pools` sin y con sesión | 404 (con sesión) / login (sin sesión) | FR-015, FR-022 |
| 18 | Suite de `005` recuperada | correr toda la suite E2E | los 60 tests originales pasan (los 7 archivos con comportamiento cambiado, actualizados) + los nuevos | SC-010, FR-031 |

## Comandos

```bash
cd frontend
npm run typecheck && npm run lint && npm test          # unitarios (contra fixtures REALES grabados)
DATABASE_URL=... node scripts/grabar-fixtures.mjs        # regraba tests/unit/api/fixtures/real/* (backend en :3000)
DATABASE_URL=... BACKEND_LOG=... npm run test:e2e        # Playwright contra el backend real; serial (1 worker)
```

Al final verificar: `usuarios` = 47, administradores reales = 3, **0** filas `test-frontend-%` en `usuarios`/`auth."user"`/`organismos`/`grupos_jueces`, **0** filas
`reset-password:*` residuales y 0 esquemas de prueba.
