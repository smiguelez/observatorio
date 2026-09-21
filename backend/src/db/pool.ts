import pg from 'pg'
import { loadPgConfig } from '../config/env.js'

let pool: pg.Pool | undefined

export function getPgPool(): pg.Pool {
  if (!pool) {
    pool = new pg.Pool(loadPgConfig())
  }
  return pool
}

export async function closePgPool(): Promise<void> {
  if (pool) {
    await pool.end()
    pool = undefined
  }
}
