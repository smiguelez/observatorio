import { useSyncExternalStore } from 'react'

// Estado "la sesión venció mientras el usuario estaba trabajando" (Edge Case de la spec). En vez de
// redirigir de inmediato (lo que descarta lo que se estaba escribiendo), se avisa y se ofrece volver a
// entrar sobre la misma pantalla: el formulario sigue montado con sus datos.
let vencida = false
const oyentes = new Set<() => void>()

const emitir = () => oyentes.forEach((o) => o())

export function marcarSesionVencida(): void {
  if (!vencida) {
    vencida = true
    emitir()
  }
}
export function limpiarSesionVencida(): void {
  if (vencida) {
    vencida = false
    emitir()
  }
}
export const estaSesionVencida = () => vencida

export function useSesionVencida(): boolean {
  return useSyncExternalStore(
    (cb) => {
      oyentes.add(cb)
      return () => oyentes.delete(cb)
    },
    () => vencida,
  )
}
