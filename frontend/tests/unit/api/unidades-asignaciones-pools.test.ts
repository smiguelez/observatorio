import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/http'
import { listarAsignaciones } from '@/api/asignaciones'
import { eliminarPool, listarPools, PoolEnUsoError } from '@/api/pools'
import { listarUnidades } from '@/api/unidades'
import { wire } from './fixtures/wire'

function responder(cuerpo: unknown, status = 200) {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(cuerpo === undefined ? null : JSON.stringify(cuerpo), { status })))
}
afterEach(() => vi.unstubAllGlobals())

describe('pools (respuestas reales)', () => {
  it('snake => camel y bigint string => number', async () => {
    responder(wire.poolsLista)
    expect(await listarPools()).toEqual([
      { id: 312, descripcion: 'Pool de ejemplo 1', totalJueces: 3, provinciaId: 1 },
      { id: 315, descripcion: 'Pool de ejemplo 2', totalJueces: 36, provinciaId: 1 },
    ])
  })
})

describe('unidades funcionales', () => {
  it('SELECT * en snake, con ids bigint como string', async () => {
    responder([{
      id: '900', organismo_id: '742', denominacion_unidad: 'uf test', localidad_id: '261', tipo_uf_id: 1,
      anio_implementacion: null, domicilio: null, telefono: null, mail: null, responsable: null, codigo_postal: null,
      firestore_id: 'api:x',
    }])
    expect(await listarUnidades(742)).toEqual([{
      id: 900, organismoId: 742, denominacionUnidad: 'uf test', localidadId: 261, tipoUfId: 1,
      anioImplementacion: null, domicilio: null, telefono: null, mail: null, responsable: null, codigoPostal: null,
    }])
  })
})

describe('asignaciones', () => {
  it('camelCase pero con ids bigint como string', async () => {
    responder([{ id: '5', grupoJuecesId: '312', cantidadAsignada: 3 }])
    expect(await listarAsignaciones(742, 900)).toEqual([{ id: 5, grupoJuecesId: 312, cantidadAsignada: 3 }])
  })
})

describe('borrado de un pool en uso (brecha G6)', () => {
  it('el 500 con code 23503 se traduce a PoolEnUsoError (mensaje claro)', async () => {
    responder({ statusCode: 500, code: '23503', error: 'Internal Server Error', message: 'update or delete on table "grupos_jueces" violates foreign key constraint' }, 500)
    await expect(eliminarPool(1)).rejects.toBeInstanceOf(PoolEnUsoError)
    await expect(eliminarPool(1)).rejects.toThrow(/asignado a otras unidades funcionales/)
  })
  it('otros errores NO se disfrazan de "pool en uso"', async () => {
    responder({ statusCode: 500, code: 'XX000', error: 'Internal Server Error', message: 'otra cosa' }, 500)
    await expect(eliminarPool(1)).rejects.toBeInstanceOf(ApiError)
    responder({ error: 'No autorizado' }, 403)
    await expect(eliminarPool(1)).rejects.toMatchObject({ status: 403 })
  })
  it('204 = borrado', async () => {
    responder(undefined, 204)
    await expect(eliminarPool(1)).resolves.toBeUndefined()
  })
})
