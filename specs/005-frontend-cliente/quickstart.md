# Quickstart: validar el frontend de punta a punta

Guía de validación, no de implementación. Cada escenario apunta al SC/FR que
prueba. Contratos: `contracts/consumed-api.md`, `contracts/routes.md`; tipos y
reglas: `data-model.md`.

## Prerrequisitos

- Node 20+ y la base de `001` con las migraciones de `public.*` al día
  (`backend/README.md`: `npm run migrate:auth && npm run migrate:public`).
- Rama con el código de `006` (ya mergeada en `005-frontend-cliente`).
- Variables del backend (nunca en el árbol del repo — Principio XIII):
  `DATABASE_URL`, `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID/SECRET`, y para
  desarrollo **`BETTER_AUTH_URL=http://localhost:5173`**.
- Credencial de Google de desarrollo con redirect URI
  `http://localhost:5173/api/auth/callback/google` (solo escenario 2).
- Frontend: `frontend/.env.local` con `VITE_DATASTUDIO_URL` (opcional).
- Datos de prueba con prefijo `test-*` (un admin, dos usuarios normales de
  distinta provincia, un organismo de tipo con taxonomía y uno de tipo
  coordinación/unidad operativa).

## Puesta en marcha

```bash
# 1. Backend (puerto 3000)
cd backend && BETTER_AUTH_URL=http://localhost:5173 npm run dev
# 2. Frontend (puerto 5173, proxy /api -> :3000, sin changeOrigin)
cd frontend && npm install && npm run dev
```

## Escenarios

| # | Escenario | Pasos | Resultado esperado | Prueba |
|---|---|---|---|---|
| 0 | **Spike de cookies (primero)** | `http://localhost:5173/login`, login con contraseña; DevTools: cookie de sesión en el origen `:5173` y `GET /api/auth/session` → 200 | Sin errores de CORS ni `403 INVALID_ORIGIN`. Si aparece `INVALID_ORIGIN`: revisar que `changeOrigin` no esté activo y `BETTER_AUTH_URL` | research Dec. 3 |
| 1 | Login por contraseña | Usuario de prueba | Entra a `/organismos` | US1-1, SC-001 |
| 2 | Login por Google | "Continuar con Google" | Vuelve autenticado, mismo usuario que (1) si el email coincide | US1-2 |
| 3 | Magic link | Pedir enlace; tomar el link **del log del backend** (G4) | Entra sin contraseña; el enlace reusado vuelve a `/login` con mensaje de enlace inválido | US1-3 |
| 4 | **Mensaje genérico** | Provocar tres fallos: contraseña errónea, email inexistente, y contraseña invalidada (usuario con credencial sin email verificado que luego verifica por magic link) | **Los tres muestran exactamente el mismo mensaje**, con acceso a Google y enlace; ningún texto ni comportamiento visible distingue la causa | US1-4, FR-002, SC-008 |
| 5 | Sin sesión | Borrar la cookie; abrir `/organismos/1` | Redirección a `/login?returnTo=…` sin destello de datos | FR-020 |
| 6 | Sin registro | Recorrer `/login` y el menú; abrir `/registro` y `/signup` por URL | No hay enlace ni pantalla de registro; las URL dan 404 | FR-022 |
| 7 | Lista y alta (`usuario_normal`) | Alta de organismo | Provincia prellenada y **no editable**; aparece en la lista sin recargar; fuero "sin fuero asignado" | US2-2/3, FR-004/005 |
| 8 | Alta sin provincia | Usuario sin provincia en el perfil intenta el alta | Mensaje que pide completarla en el perfil, no un formulario imposible de enviar | US2-5 |
| 9 | **Provincia editable (admin)** | Admin da de alta y luego edita un organismo cambiando la provincia | Se acepta y se guarda | US2-4, FR-004 |
| 10 | Ajeno | Usuario B abre organismo de A por URL | "No autorizado" (403), no una pantalla vacía | FR-021, SC-004 |
| 11 | Taxonomía dinámica | Organismo con respuestas; verificar los 4 tipos | Cada pregunta con su control y texto real, precargada; guardar y recargar conserva todo | US3-1/2/3, SC-003 |
| 12 | **Taxonomía sin preguntas** | Organismo de tipo coordinación / unidad operativa | Mensaje "este tipo de organismo no tiene taxonomía"; ningún formulario; sin request a `…/taxonomia` | US3-4, FR-023 |
| 13 | Error de taxonomía | Forzar un `400` (pregunta que no aplica al tipo) | Mensaje asociado a la pregunta | US3-5, FR-009 |
| 14 | Protección B | Cambiar tipo de un organismo con respuestas | Diálogo con `preguntasQueSePerderian`; solo tras confirmar se reenvía | spec 004 |
| 15 | UF y asignaciones | Alta de UF; abrir el diálogo de asignación; asignar pool A completo y pool B parcial; intentar duplicar A | Ambas visibles; el duplicado muestra el `400` del backend | US4, FR-011/012 |
| 16 | **Pools dentro del diálogo** | En el diálogo, crear un pool nuevo (exclusivo), asignarlo, editar `totalJueces`, y eliminar un pool **sin** asignaciones | Todo sin salir del diálogo; el pool nuevo aparece en el selector | US4-5, FR-024, SC-009 |
| 17 | Pool en uso | Eliminar un pool que tiene asignaciones | Mensaje "no se pudo eliminar, puede estar asignado a otras UF" (el backend responde 500, G6) — sin error crudo | research G6 |
| 18 | **Sin sección de pools** | Recorrer el menú completo (usuario normal y admin); abrir `/pools` por URL | No hay ítem; la URL da 404 | US5-4, FR-013 |
| 19 | Editores | Propietario o admin agrega y quita un editor; un editor intenta agregar | 403 al editor; el agregado ve el organismo en su lista | US8, FR-018 |
| 20 | Completitud y PDF (admin) | `/admin/organismos`, exportar | Partes completas/incompletas y PDF equivalente; **el organismo de tipo sin taxonomía figura con taxonomía completa**; barra de progreso durante el fan-out | US7, FR-017, SC-006 |
| 21 | No-admin en `/admin/*` | Usuario normal abre `/admin/usuarios` | Misma pantalla que una ruta inexistente | FR-016, US9-3 |
| 22 | Usuarios solo lectura | Admin abre `/admin/usuarios` | Lista con email, roles, provincia; el control de rol está deshabilitado con explicación; ninguna acción dispara una petición de cambio | US9-1/2, FR-019 |
| 23 | Perfil | Editar nombre/provincia; con credencial: cambiar contraseña; sin credencial: abrir el perfil | Cambios reflejados; **sin credencial no aparece el formulario de contraseña** sino el aviso | US6-1/2/4, FR-014 |
| 24 | Navegación | Desde cualquier pantalla llegar a perfil, ajustes y tableros | ≤ 3 clics cada uno | SC-005 |
| 25 | Sesión vencida | Expirar la cookie con un formulario a medias y guardar | Aviso + re-login por contraseña sin perder lo tipeado | Edge Case |
| 26 | Mapeo (D13) | Suite unitaria de esquemas con respuestas reales grabadas de cada endpoint | camelCase uniforme; ids de usuario `string → number`; un id no entero seguro o un campo faltante lanza `ContratoInesperado` | D13 |

## Comandos de prueba

```bash
cd frontend
npm run lint && npm run typecheck
npm test                  # Vitest: esquemas de mapeo, esquema dinámico de taxonomía, guardas, completitud
npx playwright test       # E2E contra backend real (escenarios 1, 4–7, 9–12, 15–16, 18–23)
```

Los E2E usan usuarios y organismos con prefijo `test-*` y limpian después
(mismo criterio que `backend/tests/helpers/db.ts`). Los escenarios 3, 17 y 25
combinan el backend real con un mock de red puntual cuando el caso no se
puede provocar de forma estable.
