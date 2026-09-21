// T011 (Foundational): primitivas de autorización, funciones puras sobre
// IdentidadResuelta + datos del recurso — sin HTTP, sin DB (las consultas ya
// se hicieron en resolve-identity.ts). Traducción 1:1 de las funciones de
// docs/firestore-rules-actuales.rules:
//   esAdmin()              -> esAdmin(identidad)
//   esOwnerOEditor(datos)  -> esOwnerOEditor(identidad, recurso)
//   provinciaDelUsuario()  -> mismaProvincia(identidad, recurso) (comparación,
//                             no solo la consulta: la regla real siempre la
//                             usa comparada contra resource.data.provincia)
//
// Se combinan en el llamador con OR, igual que la regla original
// ("esOwnerOEditor(...) || esAdmin()") — a propósito no están anidadas, para
// que la traducción sea legible línea a línea contra el archivo fuente.

import type { IdentidadResuelta } from '../auth/resolve-identity.js'

export function esAdmin(identidad: IdentidadResuelta): boolean {
  return identidad.rol === 'admin'
}

export interface RecursoConOwnerYEditores {
  propietarioId: bigint
  editorIds: bigint[]
}

export function esOwnerOEditor(
  identidad: IdentidadResuelta,
  recurso: RecursoConOwnerYEditores,
): boolean {
  return (
    identidad.usuarioId === recurso.propietarioId ||
    recurso.editorIds.some((id) => id === identidad.usuarioId)
  )
}

export interface RecursoConProvincia {
  provinciaId: number
}

export function mismaProvincia(
  identidad: IdentidadResuelta,
  recurso: RecursoConProvincia,
): boolean {
  return identidad.provinciaId !== null && identidad.provinciaId === recurso.provinciaId
}
