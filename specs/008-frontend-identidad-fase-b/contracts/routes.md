# Contrato de UI (delta sobre `005`): rutas, guardas y pantallas

Feature `008-frontend-identidad-fase-b`. **Extiende** `005/contracts/routes.md`. Las guardas son UX (Principio II): el control real es el `401`/`403` del backend.

## Tabla de rutas — cambios

| Ruta | Guarda | Pantalla | Cambio |
|---|---|---|---|
| `/login` | ninguna (pública) | Login | sin cambios (mensaje `ACCESO_NO_AUTORIZADO` ya cubierto por `mensajeDeErrorEnUrl`) |
| **`/primer-acceso`** | **ninguna (pública)**, hermana de `/login`, **fuera** de `RequireAuth` | **Canje del acceso inicial** | **nueva** |
| `/perfil` | `RequireAuth` | Perfil | provincia de solo lectura para usuario normal (US4) |
| `/organismos/nuevo` | `RequireAuth` | Alta de organismo | mensaje "sin provincia" (US4) |
| `/admin/usuarios` | `RequireAuth` + `RequireAdmin` | Usuarios | **deja de ser solo lectura**: alta, reemisión, rol y provincia (US1, US3) |
| `*` | `RequireAuth` | No encontrado | sin cambios; siguen sin existir `/registro`, `/signup`, `/pools` |

No se agregan entradas al menú (el alta vive dentro de `/admin/usuarios`).

### `/primer-acceso` (pública)

- Estructura como `LoginPage`: pantalla completa, sin `AppLayout`, sin sidebar ni navegación a otras pantallas.
- **No** redirige si ya hay sesión (a diferencia de `/login`): avisa antes de enviar que continuar reemplaza la sesión (FR-014).
- No hay enlace hacia ella desde ninguna pantalla de la app ni desde el login (FR-015); solo se llega por el enlace que entrega un administrador.
- Lee el acceso de `#token=…` **una vez** (primer render) y reemplaza la entrada del historial sin fragmento (FR-013).
- Estados y textos: ver `data-model.md` (máquina de estados). Un único mensaje para acceso no válido, con orientación "pedile a un administrador que te genere uno nuevo".
- Tras el éxito: invalida la sesión y navega a `/organismos` con `replace`.

### `/admin/usuarios` (admin)

- Botón "Dar de alta un usuario" → diálogo de dos pasos (formulario → enlace/vencimiento/aviso de un solo uso).
- Por fila: "Emitir acceso nuevo" (confirmación) y "Editar" (rol: confirmación solo al quitar admin; provincia: selector sin "sin provincia").
- Un usuario que no es admin ve exactamente lo mismo que ante una ruta inexistente (FR-016 de `005`).
- Si el admin se quita el rol a sí mismo, tras el éxito se lo lleva a `/organismos` (FR-020).

## Invariantes de seguridad de la pantalla pública (verificables)

1. Ninguna solicitud de red contiene el acceso en la URL ni en la cabecera `Referer` (el fragmento no se envía).
2. `location.href` no contiene el acceso después del primer render; el historial no lo conserva.
3. `localStorage`, `sessionStorage` y cookies **no** contienen el acceso ni la contraseña.
4. Ningún estado de TanStack Query (consultas ni mutaciones) contiene el acceso ni la contraseña.
5. Un acceso ausente, usado, vencido, reemplazado o inventado produce la **misma** pantalla y el mismo texto; la pantalla no consulta la validez antes del envío.
