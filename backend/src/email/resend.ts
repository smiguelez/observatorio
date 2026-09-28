// 010 (US1/US2): único lugar que sabe hablar con la API de Resend (research.md, Decisión 3). Un
// solo `POST` HTTP con `fetch` nativo — sin el SDK oficial (no aporta nada para un solo endpoint).
//
// Deliberadamente NO loguea nada acá (ni el éxito ni el fallo): quién llama decide si hace falta
// dejar una señal para un administrador (magic link, US1) o si alcanza con la respuesta HTTP que
// ya está devolviendo (acceso inicial, US2) — research.md, Decisión 2. Este módulo es puro:
// recibe datos, hace la llamada, devuelve el resultado.
import { loadEmailConfig } from '../config/env.js'

export interface EnviarEmailArgs {
  to: string
  subject: string
  html: string
}

export type ResultadoEnvio = { ok: true } | { ok: false; motivo: string }

// `fetchImpl`, y opcionalmente `apiKey`/`remitente`, son inyectables para los tests unitarios
// (T006): así se prueba el 100% de este módulo sin ninguna credencial real de Resend (research.md,
// Decisión 3) — nunca pegándole a la red real.
export interface DependenciasEnvio {
  fetchImpl?: typeof fetch
  apiKey?: string
  remitente?: string
}

function resolverCredenciales(deps: DependenciasEnvio): { resendApiKey: string; remitente: string } {
  if (deps.apiKey !== undefined && deps.remitente !== undefined) {
    return { resendApiKey: deps.apiKey, remitente: deps.remitente }
  }
  return loadEmailConfig()
}

export async function enviarEmail({ to, subject, html }: EnviarEmailArgs, deps: DependenciasEnvio = {}): Promise<ResultadoEnvio> {
  // Resolver credenciales (T003, `loadEmailConfig`) DENTRO del try: si faltan
  // (`RESEND_API_KEY`/`EMAIL_REMITENTE` sin configurar) es una falla de envío
  // como cualquier otra — nunca una excepción no capturada que rompa la
  // respuesta uniforme que espera quien llama (FR-003 de 007, ver
  // `magic-link.ts`).
  try {
    const fetchImpl = deps.fetchImpl ?? fetch
    const { resendApiKey, remitente } = resolverCredenciales(deps)
    const respuesta = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({ from: remitente, to, subject, html }),
    })

    if (!respuesta.ok) {
      const cuerpo = await respuesta.text().catch(() => '')
      return { ok: false, motivo: `Resend respondió ${respuesta.status}${cuerpo ? `: ${cuerpo}` : ''}` }
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, motivo: err instanceof Error ? err.message : 'Error desconocido al enviar el email' }
  }
}
