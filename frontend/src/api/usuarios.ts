import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { http, parsear } from './http'
import { idWire } from './ids'
import type { UsuarioId } from './sesion'

export interface Usuario {
  id: UsuarioId
  email: string
  nombreDisplay: string | null
  provinciaId: number | null
  /** `null` del wire (usuario sin roles) => `[]`. */
  roles: string[]
}

export interface UsuarioDetalle extends Usuario {
  emailVerificado: boolean
  fotoUrl: string | null
}

// snake_case en el wire; `id` es bigint => string; `roles` es `null` si el usuario no tiene ninguno
// (array_agg ... FILTER en el backend).
const UsuarioWire = z
  .object({
    id: idWire,
    email: z.string(),
    nombre_display: z.string().nullable(),
    provincia_id: idWire.nullable(),
    roles: z.array(z.string()).nullable(),
  })
  .transform((w): Usuario => ({ id: w.id, email: w.email, nombreDisplay: w.nombre_display, provinciaId: w.provincia_id, roles: w.roles ?? [] }))

const DetalleWire = z
  .object({
    id: idWire,
    email: z.string(),
    nombre_display: z.string().nullable(),
    provincia_id: idWire.nullable(),
    roles: z.array(z.string()).nullable(),
    email_verificado: z.boolean().nullable(),
    foto_url: z.string().nullable(),
  })
  .transform(
    (w): UsuarioDetalle => ({
      id: w.id, email: w.email, nombreDisplay: w.nombre_display, provinciaId: w.provincia_id,
      roles: w.roles ?? [], emailVerificado: w.email_verificado ?? false, fotoUrl: w.foto_url,
    }),
  )

// PATCH devuelve solo estos campos (sin roles ni email_verificado).
const PatchWire = z.object({ id: idWire, email: z.string(), nombre_display: z.string().nullable(), provincia_id: idWire.nullable(), foto_url: z.string().nullable() })

export async function listarUsuarios(): Promise<Usuario[]> {
  return parsear(z.array(UsuarioWire), await http('/api/usuarios'), 'usuarios')
}
export async function obtenerUsuario(id: UsuarioId): Promise<UsuarioDetalle> {
  return parsear(DetalleWire, await http(`/api/usuarios/${id}`), 'usuario')
}
/** Solo el propio usuario o un admin. NO acepta rol (el cambio de rol no existe en el backend: `007`). PATCH con COALESCE: no se puede vaciar provincia. */
export async function actualizarUsuario(id: UsuarioId, datos: { nombreDisplay?: string; provinciaId?: number; fotoUrl?: string }) {
  return parsear(PatchWire, await http(`/api/usuarios/${id}`, { method: 'PATCH', body: datos }), 'usuario')
}

export const CLAVE_USUARIOS = ['usuarios'] as const
export const useUsuarios = () => useQuery({ queryKey: CLAVE_USUARIOS, queryFn: listarUsuarios })
export const useUsuario = (id: UsuarioId | undefined) =>
  useQuery({ queryKey: [...CLAVE_USUARIOS, id], queryFn: () => obtenerUsuario(id!), enabled: id !== undefined })

export function useActualizarUsuario(id: UsuarioId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (d: Parameters<typeof actualizarUsuario>[1]) => actualizarUsuario(id, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CLAVE_USUARIOS })
      qc.invalidateQueries({ queryKey: ['sesion'] }) // la provincia de la sesión cambia (alta de organismos)
    },
  })
}
