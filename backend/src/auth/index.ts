// T009 (Foundational) + T014-T017 (US1): instancia de Better Auth con los
// tres métodos de autenticación (Principio III) y el hook de identidad
// (Principio V, T007). El esquema propio `auth` es research.md Decisión 3.

import { betterAuth } from 'better-auth'
import { PostgresDialect } from 'kysely'
import { getPgPool } from '../db/pool.js'
import { loadAuthConfig } from '../config/env.js'
import { createAuthMiddleware } from 'better-auth/api'
import { crearHookIdentidad, buscarUsuarioIdPorEmail } from './identidad-hook.js'
import { configPassword } from './providers/password.js'
import { configGoogle } from './providers/google.js'
import { configMagicLink } from './providers/magic-link.js'

const pool = getPgPool()
const authConfig = loadAuthConfig()

export const auth = betterAuth({
  secret: authConfig.secret,
  database: {
    dialect: new PostgresDialect({ pool }),
    type: 'postgres',
    schemaName: 'auth',
  },
  databaseHooks: {
    user: {
      create: {
        before: crearHookIdentidad(pool),
      },
    },
  },
  ...configPassword,
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      // 007 (FR-003, FR-006): el pedido de enlace de un email NO dado de alta responde igual que el de uno
      // dado de alta, pero no crea ningún token ni registra ningún enlace. El email se normaliza.
      if (ctx.path === '/sign-in/magic-link' && typeof ctx.body?.email === 'string') {
        const email = ctx.body.email.trim().toLowerCase()
        ctx.body.email = email
        if ((await buscarUsuarioIdPorEmail(pool, email)) === null) return ctx.json({ status: true })
      }
      // 007 (FR-018, Decisión 9): cambiar la contraseña cierra las demás sesiones SIEMPRE, no solo si el cliente
      // lo pide. Better Auth revoca todas, crea una nueva y la entrega en Set-Cookie (la cookie rota).
      if (ctx.path === '/change-password' && ctx.body) ctx.body.revokeOtherSessions = true
    }),
  },
  ...configGoogle(),
  plugins: [configMagicLink()],
  // T017 (FR-010): un segundo método solo se vincula implícitamente a una
  // identidad existente si el email de la cuenta existente ya está
  // verificado (`requireLocalEmailVerified`, default de la librería — se
  // fija acá EXPLÍCITO, no heredado en silencio, porque es exactamente lo
  // que exige el Principio V/FR-010). `google` es un proveedor de confianza
  // para el email que reporta (verifica el email de por sí); el magic link
  // no necesita estar en esta lista porque solo puede iniciar sesión con un
  // email al que ya se le envió y consumió un token — es prueba de
  // propiedad en sí mismo, no una vinculación implícita basada en un claim.
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ['google'],
      requireLocalEmailVerified: true,
    },
  },
})
