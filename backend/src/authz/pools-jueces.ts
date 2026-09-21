// T029 (US3): cablea mismaProvincia()/esAdmin() (T011) sobre
// grupos_jueces.provincia_id — FR-015. A diferencia de organismos
// (authz/organismos.ts), acá NO hay concepto de owner/editor individual: la
// autorización es puramente geográfica, y se necesita también ANTES de que
// exista una fila (al crear un pool, se valida la provincia del BODY contra
// la del usuario) — no solo contra un recurso ya guardado.
import type pg from 'pg'
import { esAdmin, mismaProvincia } from './rules.js'
import type { IdentidadResuelta } from '../auth/resolve-identity.js'

export interface PoolParaAutorizar {
  id: number
  provinciaId: number
}

export async function buscarPoolParaAutorizar(pool: pg.Pool, poolId: number): Promise<PoolParaAutorizar | null> {
  const { rows } = await pool.query<{ id: number; provincia_id: number }>(
    'SELECT id, provincia_id FROM grupos_jueces WHERE id = $1',
    [poolId],
  )
  if (rows.length === 0) return null
  return { id: rows[0]!.id, provinciaId: rows[0]!.provincia_id }
}

// El chequeo real (FR-015): misma provincia que el usuario, o admin. Se usa
// tanto contra una fila ya existente (puedeGestionarPool) como contra el
// valor de provincia que trae el body de un alta (POST /api/pools-jueces).
export function estaAutorizadoParaProvincia(identidad: IdentidadResuelta, provinciaId: number): boolean {
  return mismaProvincia(identidad, { provinciaId }) || esAdmin(identidad)
}

export function puedeGestionarPool(identidad: IdentidadResuelta, pool: PoolParaAutorizar): boolean {
  return estaAutorizadoParaProvincia(identidad, pool.provinciaId)
}
