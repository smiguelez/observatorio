# Resultado de verificación — 008 Frontend Fase B (2026-09-26)

Verificación de `008-frontend-identidad-fase-b` (frontend que consume lo que habilitó `007`). Todo contra el **backend real de `007`** y la
base real de desarrollo (usuarios `test-frontend-*`, borrados al terminar), en un **Chromium real** (Playwright). Los accesos iniciales
son los que emite el servidor, no simulados. Datos de personas anonimizados y tokens redactados.

## 1. Resumen

| Verificación | Resultado |
|---|---|
| Unitarios (`vitest`) | **26 archivos / 209 tests pasan** (línea base de partida: 18 / 152) |
| Tipos (`tsc -b` y `tsc -p tsconfig.tests.json`) | limpios |
| `npm run lint` | 0 errores (solo advertencias preexistentes de shadcn) |
| E2E completo (Playwright, backend real) | **82 ✓ / 0 ✘ / 3 saltados** en 6,3 min. Los 3 saltados son `comparacion-visual` (requiere `VIEJA_URL`, la SPA vieja) |
| Suite E2E original de `005` | los **60 tests / 15 archivos vuelven a arrancar y pasan** (excepto los 3 saltados) + 25 tests nuevos o agregados |
| Base tras las corridas | `usuarios`=47, administradores=3, **0** filas `test-%` en `usuarios`/`auth.user`/`organismos`/`grupos_jueces`, **0** `reset-password:*` |
| Datos personales / secretos en lo nuevo o modificado | 0 coincidencias (`gmail`, `Bearer`, cookies de sesión, JWT); 3 fixtures con `TOKEN-REDACTADO`; imagen del enlace con el token reemplazado por `<REDACTADO>` (verificado que el valor real no está en la pantalla) |

## 2. Escenarios de `quickstart.md`

| # | Escenario | Prueba que lo cubre | Resultado |
|---|---|---|---|
| 1 | Alta administrada | `alta-canje.spec` 1 (SQL: `Córdoba\|usuario_normal`), unit `alta-usuario` | ✓ |
| 2 | Validación del alta | `alta-canje.spec` 2 y 2b (0 solicitudes), unit | ✓ |
| 3 | Cerrar sin copiar | `alta-canje.spec` 1 y 3; unit (caché de mutaciones vacío; sin la limpieza el test falla) | ✓ |
| 4 | Canje | `alta-canje.spec` 6 (acceso real, contexto sin sesión, entra con provincia y rol) | ✓ |
| 5 | Acceso no válido | `alta-canje.spec` 7: usado, vencido, reemplazado, inventado y sin fragmento ⇒ **1 solo texto**, 0 sesiones | ✓ |
| 6 | Política de contraseña | `alta-canje.spec` 8 (0 solicitudes de canje, el acceso no se consume), unit | ✓ |
| 7 | Sesión existente | `alta-canje.spec` 9 y 10 (dos pestañas: exactamente una entra) | ✓ |
| 8 | Rol / último administrador | `rol-provincia.spec` 8 y 8b (**`page.route`**, ver §4), unit | ✓ (8b con el cuerpo literal, no con el servidor) |
| 9 | Autodescenso | `rol-provincia.spec` 9 | ✓ |
| 10 | Provincia rige sin re-login | `rol-provincia.spec` 10 (sesión 1 → 13, prellena "Mendoza"); **sin la invalidación de sesión el test falla** | ✓ |
| 11 | Perfil de solo lectura | `perfil.spec` 23a / 23a-bis (el `PATCH` no lleva `provinciaId`; un cambio directo da el `403` de 007) | ✓ |
| 12 | Alta de organismo sin provincia | `organismos.spec` 8 (sin enlace al perfil) | ✓ |
| 13 | Recorrido SC-002 redefinido | `recorrido-sc002.spec`: 14 acciones, **0 recargas, 0 pasos de provincia**, 9 respuestas en base | ✓ |
| 14 | Pool en uso | `unidades-asignaciones.spec` (400 real con el texto de 007; el pool sigue; sin la asignación se borra) | ✓ |
| 15 | Taxonomía identificable | `taxonomia.spec` 13 (real, `preguntaCodigo`) y 13b (mock), unit | ✓ |
| 16 | Invariantes de la pantalla pública | `seguridad-acceso.spec` 16: 0 solicitudes/`Referer` con el acceso; única con cuerpo `/api/acceso-inicial/canjear`; sin rastro en storage | ✓ |
| 17 | Rutas que no existen | `seguridad-acceso.spec` 17; unit `rutas-publicas`; 0 enlaces a `/primer-acceso` desde 6 pantallas | ✓ |
| 18 | Suite de `005` recuperada | E2E completo | ✓ |

## 3. Pruebas de mutación manuales (los tests detectan los defectos)

- Sin `gcTime: 0` ni `reset()` en el alta: falla el test del caché de mutaciones.
- Sin quitar el fragmento (`navigate({ hash: '' })`): falla el test de la pantalla de canje.
- Sin `queryClient.clear()` tras el canje: falla el test que verifica que no queda el caché de otra sesión.
- Sin la invalidación de sesión al cambiar de pantalla (`AppLayout`): falla `sesion-fresca` y el E2E 10 (la persona sigue viendo "Buenos Aires").
- Con el manejador vigente, quitar el comportamiento de `FST_ERR_VALIDATION`: el test muestra "Bad Request".

## 4. Lo que NO se verificó, y por qué

- **Rechazo "último administrador" contra el servidor real**: provocarlo exige quitarle el rol a los 3 administradores reales. Se verifica el
  **cliente** con `page.route` y el cuerpo literal `{"error":"El sistema no puede quedarse sin administradores."}`; la regla real (incluida la
  carrera de dos degradaciones) la prueba `backend/tests/integration/ultimo-admin.test.ts` en un esquema aislado.
- **`comparacion-visual` (3 tests)**: se saltean sin `VIEJA_URL`; su `beforeAll` (que usa el helper nuevo) **no se ejecutó**.
- **Google (T030)**: fuera de alcance (credencial OAuth real, Fase E).
- **Portapapeles**: se verificó en Chromium con permisos concedidos (`grantPermissions`) y contexto seguro (`localhost`); no en un navegador de
  usuario ni bajo HTTPS de producción. Si no hay portapapeles, el campo queda seleccionado para copiar a mano (cubierto en unitarios).
- **Backend usado**: el de `:3000` de la sesión anterior estaba **caído**; para los E2E se levantó **otra instancia del mismo código** en `:3000`
  con `BETTER_AUTH_URL=http://localhost:5173` y su salida a un archivo (`BACKEND_LOG`). No se probó contra un despliegue.

## 5. Hallazgos y desvíos

1. **Entorno de E2E sin fuentes**: el sistema no tenía ninguna fuente instalada y Chromium no dibujaba texto (los `<h1>` medían 0×0; Playwright los daba por
   "hidden"). Además faltaban librerías del sistema para Chromium. Se resolvió **sin instalar nada en el sistema** (paquetes extraídos en un directorio de
   trabajo, `LD_LIBRARY_PATH` y `FONTCONFIG_FILE`). Quedó documentado en `frontend/README.md`.
2. **`evidencia-visual.spec` también esperaba el `500`** de "pool en uso" (no figuraba en el inventario de `research.md`); actualizado junto con
   `unidades-asignaciones.spec`.
3. **Fuga de un usuario de prueba**: una primera versión de la captura del alta usaba un email sin el prefijo `test-frontend-` y dejó un usuario en la base;
   se borró y el test usa el prefijo. Estado final verificado (47 / 3 / 0).
4. **Seguridad (revisión inline del diff, T058)**: sin hallazgos. Puntos revisados: el acceso solo en estado de componente (no storage, no caché de
   TanStack Query: el canje no usa `useMutation`), quitado de la dirección con reemplazo de historial, mensaje único, `autocomplete="new-password"`,
   `queryClient.clear()` al entrar otra persona, mensajes del servidor renderizados como texto (React), sin enlaces a la pantalla pública desde ninguna pantalla.
5. **Riesgos aceptados heredados** (de `007`): el administrador conoce el enlace durante la entrega; el canje es público y sin rate limiting (D10, Fase E).
6. Se agregó a `AppLayout` una consulta de sesión por cambio de pantalla (una consulta liviana) y se extrajo `crearQueryClient()` a `src/api/queryClient.ts`
   para poder probar el manejo de `401`/`403` (`main.tsx` quedó mínimo).
