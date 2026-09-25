import { z } from 'zod'
import { ContratoInesperado } from './http'

// D13: los ids `bigint` de Postgres (organismos, UF, pools, asignaciones, localidades,
// usuarios y toda FK que apunte a ellos) llegan como STRING en el JSON; los `smallint`
// (catálogos) llegan como number. El dominio del cliente usa siempre `number`, igual
// que los cuerpos de POST/PATCH. Verificado contra el backend real el 2026-09-24
// (p. ej. `{"id":"742","propietario_id":"1186","tipo_oficina_id":1}`).
export function idDesdeWire(valor: string | number, recurso = 'id'): number {
  if (typeof valor === 'string' && !/^-?\d+$/.test(valor)) {
    throw new ContratoInesperado(recurso, '', `el id "${valor}" no es un entero`)
  }
  const n = typeof valor === 'number' ? valor : Number(valor)
  if (!Number.isSafeInteger(n)) {
    throw new ContratoInesperado(recurso, '', `el id "${valor}" no es un entero seguro`)
  }
  return n
}

export const usuarioIdDesdeWire = idDesdeWire

/** Esquema zod de un id que puede venir como string (bigint) o number (smallint/integer). */
export const idWire = z.union([z.string(), z.number()]).transform((v, ctx) => {
  try {
    return idDesdeWire(v)
  } catch (e) {
    ctx.addIssue({ code: 'custom', message: (e as Error).message })
    return z.NEVER
  }
})
