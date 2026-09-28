# Data Model: envío de email para acceso (010)

No hay entidades nuevas persistidas (research.md, Decisión 2: sin tabla de
auditoría por ahora). Lo único nuevo es conceptual, en memoria durante un
único request-response — no vive en la base.

## Intento de envío de email (conceptual, no persistido)

Representa el resultado de un único intento de entrega, dentro del mismo
ciclo de request/response que lo originó (o, para el magic link, dentro del
mismo callback de Better Auth).

| Campo | Tipo | Notas |
|---|---|---|
| `proposito` | `'magic_link' \| 'acceso_inicial'` | Cuál de los dos flujos disparó el envío. |
| `destinatario` | `string` (email) | Nunca se omite — es lo que un admin necesita para saber a quién no le llegó. |
| `resultado` | `'enviado' \| 'fallido'` | Nunca un tercer estado ("pendiente"): el `fetch` a Resend es síncrono dentro del request. |
| `motivo` | `string \| undefined` | Solo si `resultado = 'fallido'` — el mensaje de error de la API de Resend o de la red. Nunca contiene el token ni el enlace completo. |

**Nunca incluye:** el token del acceso inicial ni el del magic link, ni el
enlace completo que los contiene (FR-008). El asunto/cuerpo del email sí
contiene el enlace — eso es el propósito del email — pero esa plantilla no
se loguea en ningún punto de esta feature.

**Dónde "vive" cada uno:**
- `acceso_inicial`: nunca se persiste ni se loguea aparte — vuelve
  directamente en el cuerpo de la respuesta HTTP que ya disparó el envío
  (`emailEnviado`, ver `contracts/api.md`). El admin lo ve porque está
  mirando esa misma pantalla.
- `magic_link`: se escribe como una línea de log estructurado
  (`console.error`, JSON) — es la única de las dos formas que necesita
  "quedar" en algún lado, porque no hay nadie mirando esa pantalla en el
  momento del fallo (research.md, Decisión 2).

## Configuración (variables de entorno, no una entidad de datos)

| Variable | Obligatoria | Notas |
|---|---|---|
| `RESEND_API_KEY` | Sí, para enviar de verdad | Cargada por `loadEmailConfig()` (`config/env.ts`), mismo patrón que `BETTER_AUTH_SECRET`. Ausente ⇒ error explícito al arrancar, no un fallback silencioso (mismo criterio que `required(...)` ya usa el proyecto). |
| `EMAIL_REMITENTE` | Sí | La dirección `from` verificada (subdominio de `jufejus.org.ar` una vez verificado en Resend, research.md Decisión 1). |
