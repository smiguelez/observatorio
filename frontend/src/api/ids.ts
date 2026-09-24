import { ContratoInesperado } from './http'

// D13: `usuarios.id` es bigint y la API lo serializa como string; el dominio del
// cliente usa `number` (los cuerpos de POST también lo piden así).
export function usuarioIdDesdeWire(valor: string | number, recurso = 'usuarioId'): number {
  const n = typeof valor === 'number' ? valor : Number(valor)
  if (typeof valor === 'string' && !/^-?\d+$/.test(valor)) {
    throw new ContratoInesperado(recurso, '', `el id "${valor}" no es un entero`)
  }
  if (!Number.isSafeInteger(n)) {
    throw new ContratoInesperado(recurso, '', `el id "${valor}" no es un entero seguro`)
  }
  return n
}
