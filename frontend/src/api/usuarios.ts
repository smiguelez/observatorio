import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { http, parsear } from './http'
import { idWire } from './ids'
import type { Rol, UsuarioId } from './sesion'

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

// ---- 007 (008 Fase B): alta administrada, acceso inicial y cambio de rol -------------------------------------------
// Estos endpoints nuevos ya vienen en camelCase (verificado contra el backend real, 2026-09-25): el "mapeo" solo
// convierte ids (bigint => string en el wire) y fechas. `PATCH`/`GET` de usuarios siguen en snake_case (D13).

export interface AccesoInicial {
  token: string
  vence: Date
}
export interface AltaUsuarioInput {
  email: string
  rol: Rol
  provinciaId: number | null
}
export interface UsuarioAlta {
  id: UsuarioId
  email: string
  provinciaId: number | null
  roles: Rol[]
  accesoInicial: AccesoInicial
}

const RolSchema = z.enum(['usuario_normal', 'admin'])
const FechaWire = z.string().transform((v, ctx) => {
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) {
    ctx.addIssue({ code: 'custom', message: `fecha inválida: ${v}` })
    return z.NEVER
  }
  return d
})
const AccesoInicialWire = z.object({ token: z.string().min(1), vence: FechaWire })

const AltaWire = z
  .object({
    id: idWire,
    email: z.string(),
    provinciaId: z.number().int().nullable(),
    roles: z.array(RolSchema),
    accesoInicial: AccesoInicialWire,
  })
  .transform((w): UsuarioAlta => ({ id: w.id, email: w.email, provinciaId: w.provinciaId, roles: w.roles, accesoInicial: w.accesoInicial }))

const RolCambiadoWire = z.object({ id: idWire, roles: z.array(RolSchema) })

/** Solo admin. El servidor decide: provincia obligatoria para `usuario_normal`, email único, rol válido. */
export async function crearUsuario(datos: AltaUsuarioInput): Promise<UsuarioAlta> {
  const body = { email: datos.email, rol: datos.rol, ...(datos.provinciaId !== null ? { provinciaId: datos.provinciaId } : {}) }
  return parsear(AltaWire, await http('/api/usuarios', { method: 'POST', body }), 'usuario-alta')
}
/** Solo admin. Sin cuerpo (Fastify rechaza un POST con content-type JSON y cuerpo vacío). Invalida el acceso anterior. */
export async function emitirAccesoInicial(id: UsuarioId): Promise<AccesoInicial> {
  return parsear(AccesoInicialWire, await http(`/api/usuarios/${id}/acceso-inicial`, { method: 'POST' }), 'acceso-inicial')
}
/** Solo admin. `rol: 'admin'` agrega la fila admin; `'usuario_normal'` la quita (nunca queda el sistema sin admins). */
export async function cambiarRol(id: UsuarioId, rol: Rol): Promise<{ id: UsuarioId; roles: Rol[] }> {
  return parsear(RolCambiadoWire, await http(`/api/usuarios/${id}/rol`, { method: 'PUT', body: { rol } }), 'usuario-rol')
}

// `gcTime: 0`: TanStack Query conserva `data` y `variables` de una mutación durante `gcTime`; el acceso inicial NO debe
// quedar en el caché (FR-003). El componente copia el resultado a su estado local y llama `reset()` al cerrar.
export function useCrearUsuario() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: crearUsuario,
    gcTime: 0,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CLAVE_USUARIOS })
    },
  })
}
export function useEmitirAccesoInicial() {
  return useMutation({ mutationFn: (id: UsuarioId) => emitirAccesoInicial(id), gcTime: 0 })
}
export function useCambiarRol() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, rol }: { id: UsuarioId; rol: Rol }) => cambiarRol(id, rol),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CLAVE_USUARIOS })
      qc.invalidateQueries({ queryKey: ['sesion'] }) // el propio usuario puede haber perdido el rol
    },
  })
}
