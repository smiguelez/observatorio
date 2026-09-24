# Resultado de verificación — frontend (`005-frontend-cliente`)

Registro por historia, con evidencia real. Entorno: backend real (Fastify + Better
Auth 1.7.5) en `:3000` con `BETTER_AUTH_URL=http://localhost:5173`, frontend Vite
en `:5173` (proxy `/api`), base local `observatorio` (47 usuarios / 117 organismos
reales, que no se tocan; los fixtures son `test-frontend-*` y se borran al final de
cada corrida). Navegador: Chromium headless vía Playwright.
Cookies: ver `docs/resultado-verificacion-frontend-cookies-20260924.md` (T010).

## US1 — Login por los tres métodos (T022–T030)

Corrida: `npx playwright test login` → **6 passed** (15.1 s); `npx vitest run` →
**32 passed** (4 archivos); `tsc -b --noEmit` limpio. Evidencia:
`docs/evidencia-frontend/login-evidencia.json` y
`docs/evidencia-frontend/login-mensaje-generico.png`.

| Método | Qué se probó | Alcance real |
|---|---|---|
| Contraseña | Login desde la UI contra el backend real → `/organismos`; `returnTo` respetado (`/organismos/5?x=1`) | **De punta a punta** |
| Enlace por email | Pedido desde la UI; el link se toma del **log del backend** (el envío es un placeholder, G4); consumido en el navegador → sesión creada (`GET /api/auth/session` → 200, usuario nuevo `1179`); el mismo link reusado → `/login?error=INVALID_TOKEN` con mensaje "El enlace es inválido o venció" | **De punta a punta**, salvo el correo (no existe) |
| Google | El botón llama a `signIn.social`, el backend devuelve la URL de Google, el navegador navega a `accounts.google.com` con `redirect_uri=http://localhost:5173/api/auth/callback/google` | **NO de punta a punta.** El backend corrió con credenciales de relleno (`GOOGLE_CLIENT_ID=dummy-dev`); no hay credencial ni cuenta de Google de desarrollo en este equipo. Se verificó hasta la redirección (interceptada); el callback y la creación de sesión **quedan sin probar**. **T030 queda PENDIENTE por falta de acceso real** (no hay credencial de Google de desarrollo, confirmado por el responsable); no se simula ni se da por buena con un dummy. |

### Mensaje de error idéntico (FR-002, SC-008)

Tres causas distintas, contra el backend real, con el mismo formulario:

| Causa | Cómo se produjo | Respuesta del backend | Texto en pantalla |
|---|---|---|---|
| Contraseña incorrecta | usuario válido, clave equivocada | `401 INVALID_EMAIL_OR_PASSWORD` | "Email o contraseña incorrectos. También podés ingresar con Google o con un enlace por email. Recibir un enlace por email" |
| Cuenta inexistente | email que no existe | `401 INVALID_EMAIL_OR_PASSWORD` | idéntico |
| Credencial invalidada | alta con contraseña sin verificar email → verificación por magic link (Better Auth borra la credencial); luego login con la contraseña **correcta** | `401 INVALID_EMAIL_OR_PASSWORD` | idéntico |

El test compara los tres textos con `toBe` (igualdad exacta). Observación útil:
**el propio backend ya responde igual en los tres casos** (mismo status, mismo
`code`, mismo `message`), así que el cliente no podría distinguirlos aunque
quisiera; el cliente además no lee ni el `code` ni el `message` — usa un texto
fijo. Además hay 5 pruebas unitarias con respuestas de servidor distintas
(incluido un rechazo tipo D14, un 500 y una excepción de red) que producen el
mismo DOM. No hay ningún enlace ni botón de registro (test unitario y E2E).
`/registro`, `/signup` y `/pools` dan 404 con sesión iniciada.

### Limpieza y estado de la base

Tras la corrida: `usuarios` = 47 (los reales), `test-%` = 0, `auth."user"` = 0
(los 47 usuarios migrados aún no tienen cuenta en `auth.*`).

### Observaciones (fuera de la spec)

- Los tabs se renombraron a "Con contraseña" / "Con enlace por email": con el
  texto "Contraseña" el panel del tab quedaba etiquetado igual que el campo de
  contraseña (ambigüedad para lectores de pantalla y para las pruebas).
