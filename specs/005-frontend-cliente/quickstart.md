# Quickstart: validar el frontend de punta a punta

Guía de validación, no de implementación. Cada escenario apunta al SC/FR que
prueba. Contratos: `contracts/consumed-api.md`, `contracts/routes.md`.

## Prerrequisitos

- Node 20+ y la base de `001` con las migraciones de `public.*` al día
  (`backend/README.md`, `npm run migrate:auth && npm run migrate:public`).
- Rama con el código de `006`: `git merge reformulacion` en
  `005-frontend-cliente` (hoy la rama no lo tiene).
- Variables del backend (nunca en el árbol del repo — Principio XIII):
  `DATABASE_URL`, `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID/SECRET`, y para
  desarrollo **`BETTER_AUTH_URL=http://localhost:5173`**.
- Credencial de Google de desarrollo con redirect URI
  `http://localhost:5173/api/auth/callback/google` (solo para el escenario 2).
- Frontend: `frontend/.env.local` con `VITE_DATASTUDIO_URL` (opcional).

## Puesta en marcha

```bash
# 1. Backend (puerto 3000)
cd backend && BETTER_AUTH_URL=http://localhost:5173 npm run dev
# 2. Frontend (puerto 5173, proxy /api -> :3000)
cd frontend && npm install && npm run dev
```

## Escenarios

| # | Escenario | Pasos | Resultado esperado | Prueba |
|---|---|---|---|---|
| 0 | **Spike de cookies (hacer primero)** | Abrir `http://localhost:5173/login`, login con contraseña; en DevTools verificar cookie de sesión en el origen `localhost:5173` y `GET /api/auth/session` → 200 | Sin errores de CORS ni `403 INVALID_ORIGIN`. Si aparece `INVALID_ORIGIN`: confirmar `changeOrigin` sin activar y `BETTER_AUTH_URL` | research.md Dec. 3 |
| 1 | Login por contraseña | Login con usuario de prueba | Entra a `/organismos` | US1-1, SC-001 |
| 2 | Login por Google | "Continuar con Google" | Vuelve autenticado, mismo usuario que (1) si el email coincide | US1-2 |
| 3 | Login por magic link | Pedir enlace; copiar el link del **log del backend** (G4) | Entra sin contraseña; el enlace reusado redirige a `/login?error=INVALID_TOKEN` con mensaje | US1-3 |
| 4 | Credencial revocada | Usuario con contraseña sin email verificado → verificarlo por magic link → intentar contraseña | Mensaje explicativo + acceso a magic link (**mensaje ante cualquier fallo de credencial**, G2) | US1-4, FR-002 |
| 5 | Sin sesión | Borrar la cookie; abrir `/organismos/1` | Redirección a `/login?returnTo=…`, sin destello de datos | FR-020 |
| 6 | Lista y alta | Crear organismo (provincia bloqueada) | Aparece en la lista sin recargar; fuero "sin fuero asignado" | US2, FR-004/005 |
| 7 | Ajeno | Usuario B abre organismo de A por URL | Pantalla "No autorizado" (403), no vacía | FR-021, SC-004 |
| 8 | Taxonomía dinámica | Organismo con respuestas; verificar los 4 tipos | Cada pregunta con su control y texto real, precargada | US3, SC-003 |
| 9 | Taxonomía vacía | Organismo tipo coordinación / unidad operativa | Estado "sin taxonomía aplicable" | research Dec. 4.5 |
| 10 | Error de taxonomía | Forzar un `400` (p. ej. pregunta que no aplica al tipo) | Mensaje asociado a la pregunta | US3-4, FR-009 |
| 11 | Protección B | Cambiar tipo de un organismo con respuestas | Diálogo con `preguntasQueSePerderian`; solo tras confirmar se reenvía | spec 004 |
| 12 | UF + jueces | Alta de UF; asignar pool A completo, pool B parcial; intentar duplicar A | Ambas asignaciones visibles; el duplicado muestra el `400` del backend | US4, FR-011/012 |
| 13 | Editores | Propietario/admin agrega y quita un editor; un editor intenta agregar | 403 al editor; el agregado ve el organismo en su lista | US8, FR-018 |
| 14 | Admin: completitud y PDF | Como admin, `/admin/organismos`, exportar | Vista con partes completas/incompletas y PDF equivalente | US7, SC-006 |
| 15 | No-admin en `/admin/*` | Usuario normal abre `/admin/usuarios` | Misma pantalla que una ruta inexistente | FR-016 |
| 16 | Usuarios (lectura) | Admin abre `/admin/usuarios` | Lista con roles; cambio de rol deshabilitado y explicado (G1) | FR-019 (parcial) |
| 17 | Perfil | Editar nombre/provincia; cambiar contraseña (si tiene credencial) | Cambio reflejado; login siguiente con la nueva | US6, FR-014 |
| 18 | Navegación | Desde cualquier pantalla llegar a perfil, ajustes, tableros | ≤ 3 clics cada uno | SC-005 |
| 19 | Sesión vencida | Expirar la cookie con un formulario a medias y guardar | Aviso + re-login sin perder lo tipeado (login por contraseña) | Edge Case |

## Comandos de prueba

```bash
cd frontend
npm run lint && npm run typecheck
npm test                  # Vitest: mappers, esquema zod de taxonomía, guardas
npx playwright test       # E2E contra backend real (escenarios 1, 5–13, 15)
```

Los E2E usan usuarios y organismos con prefijo `test-*` y limpian después
(mismo criterio que `backend/tests/helpers/db.ts`).
