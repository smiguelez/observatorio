// T033 (US4): FR-016 (editar: propio usuario o admin) / FR-017 (leer:
// cualquier autenticado, sin chequeo adicional — no hay función acá para
// eso porque no hay nada que cablear: "estar autenticado" ya lo garantiza
// el hook global de FR-004).
import { esAdmin } from './rules.js'
import type { IdentidadResuelta } from '../auth/resolve-identity.js'

export function puedeEditarUsuario(identidad: IdentidadResuelta, usuarioObjetivoId: bigint): boolean {
  return identidad.usuarioId === usuarioObjetivoId || esAdmin(identidad)
}
