// T009 (Foundational) + T014-T017 (US1): instancia de Better Auth con los
// tres métodos de autenticación (Principio III) y el hook de identidad
// (Principio V, T007). El esquema propio `auth` es research.md Decisión 3.

import { betterAuth } from 'better-auth'
import { PostgresDialect } from 'kysely'
import { getPgPool } from '../db/pool.js'
import { loadAuthConfig } from '../config/env.js'
import { crearHookIdentidad } from './identity-hook.js'
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
