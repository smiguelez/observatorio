import type { FastifyRequest } from 'fastify'

// Convierte los headers de Fastify (Node) a un objeto Headers de la Fetch
// API — lo necesitan tanto el puente hacia Better Auth (app.ts) como
// cualquier llamada a auth.api.* que reciba headers (resolve-identity.ts,
// routes/auth.ts).
export function aHeadersWeb(headers: FastifyRequest['headers']): Headers {
  const webHeaders = new Headers()
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue
    if (Array.isArray(value)) {
      for (const v of value) webHeaders.append(key, v)
    } else {
      webHeaders.append(key, value)
    }
  }
  return webHeaders
}
