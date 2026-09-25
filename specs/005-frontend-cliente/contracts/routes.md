# Contrato de UI: rutas, guardas y pantallas

Feature `005-frontend-cliente`. Las guardas de ruta son **solo UX** (Principio
II); el control real es el `401`/`403` del backend en cada llamada.

| Ruta | Pantalla | Acceso (UX) | Historias / FR | Endpoints |
|---|---|---|---|---|
| `/login` | Login: contraseña · Google · enlace por email. **Sin enlace ni pantalla de registro** | pública; con sesión → `/organismos` | US1, FR-001/002/022 | `/api/auth/*` |
| `/organismos` | Lista de organismos | autenticado | US2, FR-003 | `GET /api/organismos` |
| `/organismos/nuevo` | Alta de organismo: provincia fija (`usuario_normal`) o editable (admin); fuero solo lectura | autenticado | US2, FR-004/005 | catálogos, `POST /api/organismos` |
| `/organismos/:id` | Detalle con pestañas: Datos · UF · Taxonomía · Editores | propietario/editor/admin (403 → "No autorizado") | US2–US4, US8 | `GET/PATCH/DELETE /:id`, `/fuero` |
| `/organismos/:id/unidades-funcionales/nueva` · `/:ufId` | Alta/edición de UF; desde la UF se abre el **diálogo de asignación de jueces** (asignar · crear/editar/eliminar pools) | ídem | US4, FR-010/011/012/024 | UF, asignaciones, pools, localidades |
| `/organismos/:id/taxonomia` | Formulario dinámico; estado "sin taxonomía" si el catálogo del tipo es `[]` | ídem | US3, FR-006–009/023 | catálogo + respuestas + `PUT` |
| `/organismos/:id/editores` | Gestión de editores | ver: todos con acceso; agregar/quitar: propietario o admin | US8, FR-018 | `/editores`, `GET /api/usuarios` |
| `/perfil` | Datos propios; cambio de contraseña **solo si tiene credencial**; métodos vinculados | autenticado | US6, FR-014 | `/api/usuarios/:id`, `authClient.*` |
| `/ajustes` | Punto de entrada de ajustes (contenido mínimo) | autenticado | FR-013 | — |
| `/admin/organismos` | Completitud + exportar PDF | admin | US7, FR-016/017 | fan-out por organismo |
| `/admin/usuarios` | Lista de usuarios y roles, **solo lectura** (control de rol deshabilitado con explicación) | admin | US9, FR-016/019 | `GET /api/usuarios` |
| `/no-autorizado` · `*` | 403 · 404 (idénticas para un no-admin en `/admin/*`, FR-016) | — | FR-016, FR-021 | — |

**Rutas que NO existen (decisiones 4 y 5)**: `/pools` (los pools solo se
gestionan en el diálogo de asignación de una UF) y cualquier `/registro` o
`/signup`.

Reglas transversales
- Sin sesión (`401` de `/api/auth/session` o de cualquier llamada) → `/login?returnTo=<ruta>`; no se renderiza contenido protegido antes de resolver la sesión (FR-020).
- Guarda `admin`: `sesion.rol !== 'admin'` en `/admin/*` → misma vista que `*`.
- `returnTo` solo acepta rutas relativas internas (evita open redirect).
- `/login` lee `?error=` (magic link vencido/reusado: `INVALID_TOKEN`; o rechazo de alta no provisionada tras `007`/D14) y muestra un mensaje genérico que no revela si el email existe.
- El ítem "Tableros" abre `VITE_DATASTUDIO_URL` con `target="_blank" rel="noopener noreferrer"`; sin la variable, el ítem no se muestra.
