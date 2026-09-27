import { afterEach, describe, expect, it, vi } from 'vitest'
import { obtenerCompletitud } from '@/api/completitud'
import completitud from './fixtures/real/completitud.json'

function responder(cuerpo: unknown, status = 200) {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(JSON.stringify(cuerpo), { status })))
}
afterEach(() => vi.unstubAllGlobals())

describe('completitud (respuesta REAL de GET /api/organismos/completitud, 009)', () => {
  it('pide UNA sola vez el endpoint agregado y mapea organismoId string => number', async () => {
    responder(completitud)
    const filas = await obtenerCompletitud()
    const llamadas = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls
    expect(llamadas).toHaveLength(1)
    expect(llamadas[0]![0]).toBe('/api/organismos/completitud')
    expect(filas).toHaveLength(completitud.length)
    expect(filas[0]).toEqual({ ...completitud[0], organismoId: Number(completitud[0]!.organismoId) })
    expect(typeof filas[0]!.organismoId).toBe('number')
  })
  it('la fila conserva las tres condiciones y el estado global tal como los calcula el backend', async () => {
    responder(completitud)
    const filas = await obtenerCompletitud()
    // un organismo de un tipo sin preguntas aplicables con UF => taxonomía completa con catalogoVacio
    const coordinacion = filas.find((f) => f.catalogoVacio && f.unidades)!
    expect(coordinacion).toMatchObject({ taxonomia: true, completo: true })
    // sin unidades funcionales => incompleto aunque el resto esté bien
    expect(filas.find((f) => !f.unidades)).toMatchObject({ completo: false })
  })
  it('deriva del contrato: sin un campo booleano, o un id no numérico => ContratoInesperado', async () => {
    responder([{ ...completitud[0], completo: undefined }])
    await expect(obtenerCompletitud()).rejects.toMatchObject({ name: 'ContratoInesperado' })
    responder([{ ...completitud[0], organismoId: 'abc' }])
    await expect(obtenerCompletitud()).rejects.toMatchObject({ name: 'ContratoInesperado' })
  })
  it('un 403/401 llega como ApiError (no se disfraza)', async () => {
    responder({ error: 'No autorizado' }, 403)
    await expect(obtenerCompletitud()).rejects.toMatchObject({ status: 403 })
  })
})
