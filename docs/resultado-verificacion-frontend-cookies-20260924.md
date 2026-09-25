# Resultado de verificación — cookies de sesión del frontend (T010, spike)

Fecha: 2026-09-24. Feature `005-frontend-cliente`, tarea T010 (quickstart,
escenario 0). Backend real (`backend/`, Fastify + Better Auth 1.7.5) contra la
base local `observatorio` (usuario de prueba `test-frontend-spike@example.test`,
id 1172, con prefijo `test-` como el resto de los fixtures; se borra al cerrar
la fase — ver "Limpieza"). Frontend: Vite 8.3.1 en `:5173` con proxy
`/api` → `:3000` **sin `changeOrigin`**. Navegador: Chromium headless
(Playwright 1.63, chromium-headless-shell 153) — un navegador real, no `curl`.

## Cómo se corrió

```bash
# backend (BETTER_AUTH_SECRET aleatorio de la sesión; GOOGLE_* con valores de relleno
# porque el spike no toca Google)
BETTER_AUTH_URL=http://localhost:5173 PORT=3000 npm run dev      # en backend/
npm run dev                                                      # en frontend/
npx playwright test spike-cookies                                # frontend/tests/e2e/spike-cookies.spec.ts
```

## Resultado 1 — el flujo real (evidencia: `docs/evidencia-frontend/spike-cookies.json` y `.png`)

```
✓ tests/e2e/spike-cookies.spec.ts › login por contraseña vía proxy de Vite:
  cookie same-origin y sesión 200 (776ms)   — 1 passed
```

Tráfico de red capturado en el navegador (todo contra `localhost:5173`):

| Método | URL | Status |
|---|---|---|
| POST | `http://localhost:5173/api/auth/sign-in/email` | **200** |
| GET  | `http://localhost:5173/api/auth/session` | **200** |

Cookie guardada por el navegador: `better-auth.session_token`, dominio
`localhost`, `path=/`, `httpOnly=true`, `secure=false`, `sameSite=Lax`.
Errores de consola: **ninguno** (ni CORS ni `INVALID_ORIGIN`).
Cuerpo de `/api/auth/session`: `{"usuarioId":"1172","rol":"usuario_normal","provinciaId":null}`
(confirma además que `usuarioId` llega como **string**, como asume el mapeo D13).

## Resultado 2 — controles negativos (lo que la lectura del código NO había dicho bien)

La investigación previa (research.md, Decisión 3) predijo que con el proxy
"sin `changeOrigin`" el origin check pasaba porque el `Host` coincidía con el
`Origin`. **Eso era incorrecto.** Se probó con `curl` mandando `Cookie` +
`Origin` + `Host` explícitos contra el backend:

| Backend arrancado… | Origin | Host | Resultado |
|---|---|---|---|
| **con** `BETTER_AUTH_URL=http://localhost:5173` | `http://localhost:5173` | `localhost:3000` (equivale a `changeOrigin: true`) | **200** |
| con `BETTER_AUTH_URL=http://localhost:5173` | `http://localhost:9999` | `localhost:3000` | **403 `INVALID_ORIGIN`** |
| **sin** `BETTER_AUTH_URL` | `http://localhost:5173` | `localhost:5173` (proxy sin `changeOrigin`) | **403 `INVALID_ORIGIN`** |
| sin `BETTER_AUTH_URL` | `http://localhost:5173` | `localhost:3000` | **403 `INVALID_ORIGIN`** |
| sin `BETTER_AUTH_URL` | `http://localhost:3000` | `localhost:3000` (mismo origen, sin proxy) | **403 `INVALID_ORIGIN`** |
| sin `BETTER_AUTH_URL` | `http://localhost:3000` | `localhost:5173` | **403 `INVALID_ORIGIN`** |

Conclusiones:

1. **`BETTER_AUTH_URL` es obligatoria** para cualquier `POST` que lleve cookie,
   en cualquier entorno: sin ella la lista de orígenes confiables queda vacía y
   Better Auth rechaza incluso el mismo origen. No es un detalle de dev.
2. **Con `BETTER_AUTH_URL` fijada, `changeOrigin` no importa** (el origen
   confiable sale de la variable, no del `Host`). Se mantiene sin activar por
   simplicidad, pero la corrección de research.md es: la variable es el
   requisito, `changeOrigin` es irrelevante.
3. **CORS directo sigue sin existir**: `OPTIONS /api/auth/sign-in/email` con
   `Origin: http://localhost:5173` responde `404 Route OPTIONS:… not found`,
   sin cabeceras `Access-Control-*`. Un cliente cross-origin no llegaría ni a
   enviar el `POST`. El proxy same-origin sigue siendo la única vía sin tocar
   el backend.

Impacto: `BETTER_AUTH_URL` debe figurar entre las variables requeridas del
backend (hoy `backend/README.md` no la lista). Es configuración, no cambio de
código de backend.

## Resultado 3 — entorno de prueba (para reproducir)

Chromium no arrancaba en este equipo por librerías del sistema ausentes
(`libnspr4`, `libnss3`, X11/atk/gbm, fuentes). Sin instalar nada a nivel
sistema, se bajaron los `.deb` con `apt-get download`, se extrajeron con
`dpkg -x` a un directorio temporal y se usaron con `LD_LIBRARY_PATH` y
`FONTCONFIG_FILE`. Playwright también necesita `npx playwright install chromium`.

## No cubierto por este spike

- Google (`redirect_uri` real) y magic link: se validan en US1 (T030).
- Producción con mismo origen detrás de un proxy propio (D5).

## Limpieza

El usuario `test-frontend-spike@example.test` (id 1172) y sus filas de
`auth.*` quedan hasta terminar las pruebas de US1; se borran con el helper de
`backend/tests/helpers/db.ts` (`limpiarUsuariosDePrueba`, prefijo
`test-frontend-`).
