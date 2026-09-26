import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/http'
import { listarAsignaciones } from '@/api/asignaciones'
import { eliminarPool, listarPools } from '@/api/pools'
import poolEnUso from './fixtures/real/error-pool-en-uso.json'
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

describe('borrado de un pool en uso (007/D16: el servidor responde 400 con su mensaje)', () => {
  it('el 400 REAL de 007 llega como ApiError cuyo mensaje ES el texto del servidor (sin inferir nada)', async () => {
    responder(poolEnUso, 400)
    const e = await eliminarPool(1).catch((x: unknown) => x)
    expect(e).toBeInstanceOf(ApiError)
    expect(e).toMatchObject({ status: 400, message: 'El pool está asignado a unidades funcionales; quitalo de esas asignaciones antes de eliminarlo.' })
  })
  it('un 500 con code 23503 (lo que respondía antes de 007) YA NO se disfraza de "pool en uso": es un error genérico', async () => {
    responder({ statusCode: 500, code: '23503', error: 'Internal Server Error', message: 'violates foreign key constraint' }, 500)
    const e = await eliminarPool(1).catch((x: unknown) => x)
    expect(e).toBeInstanceOf(ApiError)
    expect((e as Error).message).not.toMatch(/asignado a otras unidades funcionales/)
  })
  it('un 403 sigue siendo ApiError 403', async () => {
    responder({ error: 'No autorizado' }, 403)
    await expect(eliminarPool(1)).rejects.toMatchObject({ status: 403, message: 'No autorizado' })
  })
  it('204 = borrado', async () => {
    responder(undefined, 204)
    await expect(eliminarPool(1)).resolves.toBeUndefined()
  })
})
