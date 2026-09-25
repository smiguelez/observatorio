import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { http, parsear } from './http'
import { idWire } from './ids'
import type { UsuarioId } from './sesion'

export interface Editor {
  usuarioId: UsuarioId
  nombre: string | null
  email: string
}

// camelCase en el wire, pero `usuarioId` es bigint => string (D13). `nombre` sale de `nombre_display`.
const EditorWire = z
  .object({ usuarioId: idWire, nombre: z.string().nullable(), email: z.string() })
  .transform((w): Editor => w)

const ruta = (orgId: number) => `/api/organismos/${orgId}/editores`

export async function listarEditores(orgId: number): Promise<Editor[]> {
  return parsear(z.array(EditorWire), await http(ruta(orgId)), 'editores')
}
/** Solo propietario o admin (un editor recibe 403). El cuerpo lleva el id como NÚMERO. 400: ya es editor / usuario inexistente. */
export async function agregarEditor(orgId: number, usuarioId: UsuarioId): Promise<void> {
  parsear(z.object({ usuarioId: idWire }), await http(ruta(orgId), { method: 'POST', body: { usuarioId } }), 'editor')
}
export async function quitarEditor(orgId: number, usuarioId: UsuarioId): Promise<void> {
  await http(`${ruta(orgId)}/${usuarioId}`, { method: 'DELETE' })
}

export const claveEditores = (orgId: number) => ['organismos', orgId, 'editores'] as const
export const useEditores = (orgId: number) => useQuery({ queryKey: claveEditores(orgId), queryFn: () => listarEditores(orgId) })

export function useAgregarEditor(orgId: number) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (u: UsuarioId) => agregarEditor(orgId, u), onSuccess: () => qc.invalidateQueries({ queryKey: claveEditores(orgId) }) })
}
export function useQuitarEditor(orgId: number) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (u: UsuarioId) => quitarEditor(orgId, u), onSuccess: () => qc.invalidateQueries({ queryKey: claveEditores(orgId) }) })
}
