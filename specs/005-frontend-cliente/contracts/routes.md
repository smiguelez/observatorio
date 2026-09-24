# Contrato de UI: rutas, guardas y pantallas

Feature `005-frontend-cliente`. Las guardas de ruta son **solo UX** (Principio
II); el control real es el `401`/`403` del backend en cada llamada.

| Ruta | Pantalla | Acceso (UX) | Historias / FR | Endpoints |
|---|---|---|---|---|
| `/login` | Login (tabs: contraseña · Google · enlace por email) | pública; si hay sesión → `/organismos` | US1, FR-001/002 | `/api/auth/*` |
| `/organismos` | Lista de organismos | autenticado | US2, FR-003 | `GET /api/organismos`, catálogos |
| `/organismos/nuevo` | Alta de organismo (provincia y fuero solo lectura) | autenticado | US2, FR-004/005 | catálogos, `POST /api/organismos` |
| `/organismos/:id` | Detalle con pestañas: Datos · UF · Taxonomía · Editores | propietario/editor/admin (403 → "No autorizado") | US2–US4, US8, FR-005/010 | `GET/PATCH/DELETE /:id`, `/fuero` |
| `/organismos/:id/unidades-funcionales/nueva` · `/:ufId` | Alta/edición de UF + asignaciones de jueces | ídem | US4, FR-010/011/012 | UF, asignaciones, pools, localidades |
| `/organismos/:id/taxonomia` | Formulario dinámico | ídem | US3, FR-006–009 | catálogo + respuestas + `PUT` |
| `/organismos/:id/editores` | Gestión de editores | ver: todos con acceso; agregar/quitar: propietario o admin | US8, FR-018 | `/editores`, `GET /api/usuarios` |
| `/pools` | Pools de jueces de la provincia | autenticado | US4 (soporte) | `/api/pools-jueces` |
| `/perfil` | Datos propios, contraseña, métodos vinculados | autenticado | US6, FR-014 | `/api/usuarios/:id`, `authClient.*` |
| `/ajustes` | Punto de entrada de ajustes (contenido mínimo) | autenticado | FR-013 | — |
| `/admin/organismos` | Completitud + exportar PDF | admin | US7, FR-016/017 | fan-out por organismo |
| `/admin/usuarios` | Lista de usuarios y roles (cambio de rol: ver G1) | admin | US9, FR-016/019 | `GET /api/usuarios` |
| `/no-autorizado` · `*` | 403 · 404 (idénticas para no-admin en `/admin/*`, FR-016) | — | FR-016, FR-021 | — |

Reglas transversales
- Sin sesión (`401` de `/api/auth/session` o de cualquier llamada) → `/login?returnTo=<ruta>`; no se renderiza contenido protegido antes de resolver la sesión (FR-020).
- Guarda `admin`: `sesion.rol !== 'admin'` en `/admin/*` → misma vista que `*` (404).
- `returnTo` solo acepta rutas relativas internas (evita open redirect).
- El ítem de menú "Tableros" abre `VITE_DATASTUDIO_URL` con `target="_blank" rel="noopener noreferrer"`.
