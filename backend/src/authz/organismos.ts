// T023 (US2): cablea esOwnerOEditor()/esAdmin() (T011) contra
// organismos.propietario_id + organismo_editores — FR-012. Un solo punto de
// verdad para "puede este usuario gestionar este organismo", reusado por
// las rutas de organismos y por las subrutas de UF/taxonomía (FR-014: misma
// regla que el organismo padre, sin regla propia).
import type pg from 'pg'
import { esAdmin, esOwnerOEditor } from './rules.js'
import type { IdentidadResuelta } from '../auth/resolve-identity.js'

export interface OrganismoParaAutorizar {
  id: number
  propietarioId: bigint
  editorIds: bigint[]
}

export async function buscarOrganismoParaAutorizar(
  pool: pg.Pool,
  organismoId: number,
): Promise<OrganismoParaAutorizar | null> {
  const { rows } = await pool.query<{ id: number; propietario_id: string }>(
    'SELECT id, propietario_id FROM organismos WHERE id = $1',
    [organismoId],
  )
  if (rows.length === 0) return null

  const editores = await pool.query<{ usuario_id: string }>(
    'SELECT usuario_id FROM organismo_editores WHERE organismo_id = $1',
    [organismoId],
  )

  return {
    id: rows[0]!.id,
    propietarioId: BigInt(rows[0]!.propietario_id),
    editorIds: editores.rows.map((r) => BigInt(r.usuario_id)),
  }
}

export function puedeGestionarOrganismo(
  identidad: IdentidadResuelta,
  organismo: OrganismoParaAutorizar,
): boolean {
  return (
    esOwnerOEditor(identidad, { propietarioId: organismo.propietarioId, editorIds: organismo.editorIds }) ||
    esAdmin(identidad)
  )
}
