import { z } from 'zod'
import { http, parsear } from './http'
import { idWire } from './ids'

export interface Catalogo {
  id: number
  nombre: string
}

const CatalogoWire = z.object({ id: z.number().int(), nombre: z.string() })
const ListaCatalogoWire = z.array(CatalogoWire)

async function catalogo(ruta: string, recurso: string): Promise<Catalogo[]> {
  return parsear(ListaCatalogoWire, await http(ruta), recurso)
}

export const obtenerProvincias = () => catalogo('/api/provincias', 'provincias')
export const obtenerDenominacionesSimplificadas = () =>
  catalogo('/api/denominaciones-simplificadas', 'denominaciones-simplificadas')
export const obtenerTiposOficina = () => catalogo('/api/tipos-oficina', 'tipos-oficina')
export const obtenerTiposUf = () => catalogo('/api/tipos-uf', 'tipos-uf')
export const obtenerFueros = () => catalogo('/api/fueros', 'fueros')

export interface Localidad {
  id: number
  nombre: string
  provinciaId: number
  latitud: number | null
  longitud: number | null
}

// snake_case en el wire; latitud/longitud pueden venir como string (numeric de Postgres) o null.
const numeroONull = z
  .union([z.number(), z.string(), z.null()])
  .transform((v) => (v === null || v === '' ? null : Number(v)))

const LocalidadWire = z
  .object({
    id: idWire, // localidades.id es bigint => string en el wire
    nombre: z.string(),
    provincia_id: idWire,
    latitud: numeroONull,
    longitud: numeroONull,
  })
  .transform((w): Localidad => ({
    id: w.id,
    nombre: w.nombre,
    provinciaId: w.provincia_id,
    latitud: w.latitud,
    longitud: w.longitud,
  }))

export async function obtenerLocalidades(): Promise<Localidad[]> {
  return parsear(z.array(LocalidadWire), await http('/api/localidades'), 'localidades')
}
