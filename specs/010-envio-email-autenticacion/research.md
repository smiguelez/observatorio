# Research: envío de email para acceso (009)

## Decisión 1 — El dominio de prueba de Resend NO alcanza; hace falta un dominio propio verificado

**Fuente**: documentación y notas de soporte de Resend, verificadas por
búsqueda directa (no de memoria) — [Resend, "403 Error Using resend.dev
Domain"](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain),
["Add and verify a domain"](https://resend.com/docs/add-a-domain), y
confirmación cruzada por comunidad ([issue en
swift-resend](https://github.com/hsharghi/swift-resend/issues/15)).

**Decisión.** El dominio de prueba (`onboarding@resend.dev`) **no es una
cuestión de volumen**, es una restricción de destino: **solo puede entregar
al email con el que se creó la cuenta de Resend**. Cualquier otro
destinatario recibe un `403` inmediato. Esto descarta el dominio de prueba
por completo para esta feature — ni el magic link (que tiene que llegarle a
cada usuario real) ni el acceso inicial (que tiene que llegarle a la persona
recién dada de alta) pueden usarlo, sin importar que sean "menos de 50
usuarios" o "altas esporádicas": la restricción es sobre el destinatario, no
sobre la cantidad de envíos.

**Hace falta verificar un dominio propio antes de poder enviar en serio.**
Confirmado en la investigación anterior de esta misma sesión:
`jufejus.org.ar` ya está delegado a Cloudflare (NS `gail.ns.cloudflare.com` /
`maxim.ns.cloudflare.com`, confirmado por RDAP de NIC.ar). Verificar un
subdominio de envío (p. ej. `send.jufejus.org.ar`, el patrón que usa Resend
por defecto para no mezclar los registros de envío transaccional con el
dominio raíz que ya sirve el sitio en WordPress) implica:

- Agregar en esa zona de Cloudflare: **un registro MX** (rebotes), **un
  TXT de SPF**, y **tres registros CNAME de DKIM** (Resend usa "SES Easy
  DKIM", tres CNAME, no un TXT único como versiones viejas de su propio
  producto). Un DMARC es opcional pero recomendado, no lo exige la
  verificación en sí.
- **Tiempo:** la propagación DNS puede tardar hasta 24 horas. Es
  configuración de una sola vez, no algo que se pueda dejar para el mismo
  día del envío real.
- **El bloqueante real no es técnico, es de acceso**: como ya se estableció
  antes en esta sesión, hace falta acceso administrativo a esa cuenta de
  Cloudflare (quien gestiona hoy el WordPress de `jufejus.org.ar`, o que
  esa persona cree los registros) — no una migración de DNS.

**Alternativas evaluadas.**

| Opción | Resultado |
|---|---|
| **Verificar un subdominio de `jufejus.org.ar` en Resend** (elegida) | Domino ya en Cloudflare (sin migrar nada); una tanda de registros DNS, una sola vez; deja both flows enviando a cualquier destinatario real. |
| Seguir con `onboarding@resend.dev` para salir del paso | Descartada: no es un atajo temporal viable — literalmente no puede entregarle un enlace a ningún usuario real que no sea el dueño de la cuenta de Resend. No sirve ni para un piloto con un solo usuario de prueba ajeno. |
| Cambiar de proveedor para evitar la verificación de dominio | Descartada: fuera de alcance (el proveedor ya lo decidió el usuario) y no resolvería nada — SPF/DKIM es un requisito de la industria del email transaccional en general, no una particularidad de Resend; cualquier proveedor serio va a pedir lo mismo. |

**Qué implica en tiempo de configuración, en una frase:** cero código
bloqueado por esto (se puede diseñar e implementar todo sin la API key
real, ver Decisión 3), pero el envío real a usuarios reales **no** puede
encenderse hasta que alguien con acceso a Cloudflare agregue esos 5
registros y pase la propagación — hay que pedir ese acceso ahora, no cuando
el código ya esté listo.

---

## Decisión 2 — Dónde se registra el fallo de envío del magic link (US1)

**Fuente**: código real del backend — `backend/src/app.ts` (`Fastify({
logger: opciones.logStream ? {...} : true })`, pino ya integrado),
`backend/tests/integration/acceso-inicial-logs.test.ts` (patrón ya
existente de capturar logs con un `Writable` + `vi.spyOn(console, 'log')`),
y `find backend/migrations` (4 migraciones, ninguna de auditoría/log).

**Decisión.** **No hace falta una tabla nueva. Se reutiliza el logging
estructurado que ya existe**, con dos matices por caso:

- Para el fallo del **acceso inicial** (US2): no hace falta ningún
  mecanismo de registro nuevo en absoluto — el admin está presente en la
  pantalla en el mismo momento del pedido, así que el fallo simplemente
  vuelve en la respuesta HTTP de la misma acción que ya dispara (alta o
  reemisión), y el frontend lo muestra ahí (contracts/api.md). No hay nada
  que "notar aparte" en este caso.
- Para el fallo del **magic link** (US1, sin nadie presente): acá sí hace
  falta que quede una señal para que un admin la encuentre después. El
  backend ya tiene un logger estructurado (pino, vía Fastify) para logs de
  request/response, pero **no está disponible dentro de la función que
  envía el magic link**: `auth` (`betterAuth(...)`) se construye una sola
  vez, a nivel de módulo, ANTES de que exista cualquier instancia de
  Fastify (`buildApp()`), y el callback `sendMagicLink({ email, url, token
  })` que le pasa Better Auth no recibe `request`/`reply` — no hay forma de
  llegar al `app.log` de esa instancia desde ahí. Por eso el mecanismo hoy
  usado (`console.log`, interceptado en los tests con `vi.spyOn(console,
  'log')`) sigue siendo el más consistente: se reemplaza por un
  `console.error` con una línea **estructurada** (JSON con `evento`,
  `proposito: 'magic_link'`, el email destinatario y el motivo del fallo —
  nunca el token), interceptable con el mismo patrón de spy que ya prueba
  hoy que nada sensible se loguea.
- En producción, ambos (pino y `console.error`) terminan en el mismo lugar
  (stdout del proceso); la Fase E del plan hacia producción (gestión de
  procesos real, `systemd`) ya es la responsable de que ese stdout quede en
  algún lado revisable — esta feature no duplica esa responsabilidad.

**Alternativas evaluadas.**

| Opción | Resultado |
|---|---|
| **`console.error` estructurado, mismo patrón de spy ya probado** (elegida) | Cero infraestructura nueva; consistente con cómo el propio proyecto ya prueba "esto no se loguea"/"esto sí se loguea"; funciona hoy mismo sin esperar a la Fase E. |
| Tabla nueva `intentos_envio_email` + pantalla de admin para verlos | Descartada **por ahora**: no hay ninguna infraestructura de auditoría persistida en el proyecto hoy (0 migraciones de ese tipo), y construir una tabla + UI para un volumen de "altas esporádicas" es una capa nueva no pedida por la spec. Si el volumen crece o los fallos se vuelven un problema real, es el paso natural siguiente — no bloquea esta feature, se documenta para no perderlo de vista. |
| Un servicio externo de alertas/monitoreo | Descartada: no existe ninguno configurado en este proyecto todavía; es una decisión de la Fase E (infraestructura), no de esta feature puntual. |

---

## Decisión 3 — Forma del módulo de envío: `fetch` directo a la API de Resend, sin SDK

**Fuente**: `backend/package.json` (Node ya con `fetch` global, ninguna
dependencia de HTTP client agregada hasta ahora salvo lo estrictamente
necesario — `pg`, `better-auth`, `fastify`), y el propio pedido original
("API HTTP simple").

**Decisión.** Un módulo `backend/src/email/resend.ts` con una única función
`enviarEmail({ to, subject, html }): Promise<{ ok: true } | { ok: false;
motivo: string }>`, que hace un `POST` con `fetch` nativo a
`https://api.resend.com/emails` con el header `Authorization: Bearer
${RESEND_API_KEY}` — sin agregar el paquete oficial `resend` como
dependencia nueva. La API key y el remitente se cargan por
`loadEmailConfig()` en `config/env.ts`, mismo patrón que
`loadAuthConfig()`/`loadPgConfig()` (constitution, Principio XIII). Los dos
flujos (`magic-link.ts`, `routes/usuarios.ts`) llaman a esta única función —
ninguno de los dos vuelve a implementar la llamada HTTP ni la regla de "no
loguear el contenido".

**Sin API key real para diseñar/implementar.** El wrapper y sus tests usan
un `fetch` inyectable/mockeable (mismo criterio que ya usa el proyecto para
no pegarle a servicios reales en tests, ver `errores-integridad.test.ts` y
similares) — se puede escribir y probar el 100% del código sin ninguna
credencial real de Resend. La API key real es un prerequisito **solo** de
la tarea puntual de probar un envío de punta a punta contra la API real de
Resend (y, antes que eso, de la Decisión 1: sin dominio verificado, esa
prueba puntual fallaría con 403 igual) — se marca así de explícito en
`tasks.md`, no como gate de todo el plan.

**Alternativas evaluadas.**

| Opción | Resultado |
|---|---|
| **`fetch` nativo, sin SDK** (elegida) | Cero dependencias nuevas; la API de Resend para enviar un email es un único `POST` con JSON — no hay superficie que un SDK simplifique de forma significativa para este caso de uso. |
| Paquete oficial `resend` (npm) | Descartada por ahora: agrega una dependencia para un solo endpoint que ya es trivial por `fetch`; queda documentada como swap fácil si más adelante hiciera falta algo que el SDK resuelva mejor (webhooks de entrega, envío en lote) — no es el caso de esta feature. |

---

## Decisión 4 — Forma de la opción "enviar por email" en alta/reemisión (US2)

**Fuente**: código real — `backend/src/routes/usuarios.ts` (alta ya emite
el acceso inicial en la misma respuesta del `POST /api/usuarios`;
reemisión ya es su propio `POST .../acceso-inicial` que devuelve token +
vencimiento), `frontend/src/routes/admin/AltaUsuarioDialog.tsx`
(`AccesoInicialDialog` ya es el componente compartido entre alta y
reemisión).

**Decisión.** Los dos endpoints existentes (`POST /api/usuarios`, `POST
/api/usuarios/:id/acceso-inicial`) ganan un campo opcional en el body
(`enviarPorEmail?: boolean`). El token y su vencimiento **siempre** se
devuelven igual que hoy (así "copiar enlace" sigue disponible siempre,
FR-005); si se pidió el envío, la respuesta suma el resultado
(`emailEnviado: true | false`) en el mismo viaje de ida y vuelta — sin
segundo endpoint, sin nada asíncrono. El componente compartido
(`AccesoInicialDialog`) ya es el lugar natural para mostrar las dos
opciones una vez (alta y reemisión comparten esta pantalla hoy).

**Alternativas evaluadas.**

| Opción | Resultado |
|---|---|
| **Campo opcional en el body de los endpoints ya existentes** (elegida) | Un solo viaje de ida y vuelta; el token sigue siempre presente; no hay estado intermedio que sincronizar entre "se generó" y "se envió". |
| Endpoint nuevo `.../acceso-inicial/enviar-email` | Descartada: indirección innecesaria — el admin ya dispara una sola acción (alta o reemisión); pedirle un segundo paso para el envío no aporta nada que el campo opcional no resuelva. |
