// 007 (T008): el alta administrada inserta en auth."user" por SQL (Decisión 4).
// Este test detecta si un cambio de esquema de Better Auth rompería ese INSERT.
import { afterAll, describe, expect, it } from 'vitest'
import { getMigrations } from 'better-auth/db/migration'
import { getAuthTables } from 'better-auth/db'
import { auth } from '../../src/auth/index.js'
import { closePgPool, getPgPool } from '../../src/db/pool.js'

const pool = getPgPool()

describe('Contrato: esquema auth."user" que usa el alta administrada', () => {
  afterAll(async () => {
    await closePgPool()
  })

  it('no hay migraciones pendientes de Better Auth', async () => {
    const { toBeCreated, toBeAdded } = await getMigrations(auth.options)
    expect(toBeCreated).toEqual([])
    expect(toBeAdded).toEqual([])
  })

  it('las columnas de auth."user" son exactamente id + los campos que reporta Better Auth', async () => {
    const tablas = getAuthTables(auth.options)
    const camposLibreria = Object.values(tablas.user!.fields).map((f) => (f as { fieldName?: string }).fieldName)
    const { rows } = await pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'auth' AND table_name = 'user'`,
    )
    const enBase = rows.map((r) => r.column_name).sort()
    const esperadas = ['id', ...camposLibreria].sort()
    expect(enBase).toEqual(esperadas)
  })

  it('las columnas obligatorias que el servicio de alta no informa tienen default', async () => {
    // provisionarUsuario inserta: id, name, email, "emailVerified", "createdAt", "updatedAt".
    const { rows } = await pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'auth' AND table_name = 'user'
          AND is_nullable = 'NO' AND column_default IS NULL
          AND column_name NOT IN ('id','name','email','emailVerified','createdAt','updatedAt')`,
    )
    expect(rows).toEqual([])
  })
})
