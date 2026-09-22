// T013 (Foundational): esqueleto de la app Fastify. Registra config, pool,
// Better Auth (montado en /api/auth/*), y el hook global de FR-004: 401
// explícito para cualquier ruta sin sesión válida, salvo /api/auth/* (que
// maneja sus propios códigos de estado). Las rutas de dominio (organismos,
// pools_jueces, usuarios, localidades) se agregan en las historias
// siguientes (US2-US5) — acá no hay ninguna todavía.

import Fastify from 'fastify'
import fastifyCookie from '@fastify/cookie'
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox'
import { auth } from './auth/index.js'
import { getPgPool } from './db/pool.js'
import { resolverIdentidad, type IdentidadResuelta } from './auth/resolve-identity.js'
import { loadPort } from './config/env.js'
import { aHeadersWeb } from './http/headers.js'
import { registrarRutasAuth } from './routes/auth.js'
import { registrarRutasOrganismos } from './routes/organismos.js'
import { registrarRutasPoolsJueces } from './routes/pools-jueces.js'
import { registrarRutasUsuarios } from './routes/usuarios.js'
import { registrarRutasLocalidades } from './routes/localidades.js'

declare module 'fastify' {
  interface FastifyRequest {
    identidad?: IdentidadResuelta
  }
}

export async function buildApp() {
  const app = Fastify({ logger: true }).withTypeProvider<TypeBoxTypeProvider>()
  const pool = getPgPool()

  app.register(fastifyCookie)

  // T018: nuestra propia ruta (IdentidadResuelta), registrada ANTES del
  // wildcard de Better Auth — Fastify prioriza rutas estáticas sobre
  // wildcards de todos modos, pero el orden explícito documenta la
  // intención (verificado empíricamente: ver resultado del smoke test).
  await app.register(registrarRutasAuth)

  // T022/T024 (US2): CRUD de organismos + subrutas de UF/taxonomía.
  await app.register(registrarRutasOrganismos)

  // T028 (US3): CRUD de pools de jueces, scoping por provincia.
  await app.register(registrarRutasPoolsJueces)

  // T032 (US4): perfiles de usuario — lectura amplia, edición acotada.
  await app.register(registrarRutasUsuarios)

  // T036 (US5): catálogo de localidades, solo lectura.
  await app.register(registrarRutasLocalidades)

  // Rutas de Better Auth (FR-005): login/logout, callback de Google,
  // solicitud/verificación de magic link. Se configuran los proveedores
  // concretos en US1 (T014-T016) — acá solo el puente Fastify <-> Better
  // Auth (que usa Request/Response de la Fetch API, no el req/res de Node).
  //
  // NOTA (a revisar en US1): el body se re-serializa desde `request.body`
  // ya parseado por Fastify, en vez de reenviar el buffer crudo — funciona
  // para JSON (todos los endpoints de Better Auth lo son) pero es una
  // simplificación de esqueleto, no la versión endurecida final.
  app.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
    handler: async (request, reply) => {
      const url = `${request.protocol}://${request.hostname}${request.url}`
      const init: RequestInit = {
        method: request.method,
        headers: aHeadersWeb(request.headers),
      }
      if (request.method !== 'GET' && request.method !== 'HEAD' && request.body !== undefined) {
        init.body = JSON.stringify(request.body)
      }
      const webRequest = new Request(url, init)
      const response = await auth.handler(webRequest)

      reply.status(response.status)
      response.headers.forEach((value, key) => {
        reply.header(key, value)
      })
      reply.send(await response.text())
    },
  })

  // FR-004: 0 acceso sin autenticar a ninguna ruta de dominio. Se relee la
  // identidad en cada request (FR-002) — nunca se cachea entre requests.
  app.addHook('onRequest', async (request, reply) => {
    if (request.url.startsWith('/api/auth')) return

    const identidad = await resolverIdentidad(pool, auth, aHeadersWeb(request.headers))
    if (!identidad) {
      reply.code(401).send({ error: 'No autenticado' })
      return
    }
    request.identidad = identidad
  })

  return app
}

const esEntryPointDirecto = import.meta.url === `file://${process.argv[1]}`
if (esEntryPointDirecto) {
  const app = await buildApp()
  app.listen({ port: loadPort(), host: '0.0.0.0' }).catch((err) => {
    app.log.error(err)
    process.exit(1)
  })
}
