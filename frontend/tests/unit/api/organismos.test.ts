import { describe, expect, it } from 'vitest'
import { ApiError } from '@/api/http'
import { obtenerOrganismo, listarOrganismos, preguntasPorPerder } from '@/api/organismos'
import { obtenerFuero } from '@/api/fuero'
import { afterEach, vi } from 'vitest'
import { wire } from './fixtures/wire'

function responder(cuerpo: unknown, status = 200) {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(JSON.stringify(cuerpo), { status })))
}
afterEach(() => vi.unstubAllGlobals())

describe('mapeo de organismos (respuestas reales del backend)', () => {
  it('lista: id y propietario_id bigint (string) => number, snake => camel', async () => {
    responder(wire.organismosLista)
    expect(await listarOrganismos()).toEqual([{ id: 742, denominacion: 'test-frontend-org', propietarioId: 1186 }])
  })

  it('detalle (SELECT *): mezcla bigint string y smallint number, sin filtrar por campos extra', async () => {
    responder(wire.organismoDetalle)
    expect(await obtenerOrganismo(742)).toEqual({
      id: 742,
      denominacion: 'test-frontend-org',
      propietarioId: 1186,
      denominacionSimplificadaId: 1,
      tipoOficinaId: 1,
      provinciaId: 1,
      estadoFueros: 'sin_fueros_asignados',
      actualizadoA: '2026-09-24T20:05:33.573Z',
    })
  })

  it('un campo faltante lanza ContratoInesperado nombrando el campo', async () => {
    const { tipo_oficina_id: _omitido, ...sinTipo } = wire.organismoDetalle
    responder(sinTipo)
    await expect(obtenerOrganismo(742)).rejects.toMatchObject({ name: 'ContratoInesperado', campo: 'tipo_oficina_id' })
  })

  it('fuero vacío no es error', async () => {
    responder(wire.fueroVacio)
    expect(await obtenerFuero(742)).toEqual({ fueros: [], fueroSimplificado: null })
  })
})

describe('Protección B', () => {
  it('extrae las preguntas que se perderían del 400', () => {
    const e = new ApiError(400, 'x', { error: 'x', preguntasQueSePerderian: [{ codigo: 'a', texto: 'A?' }] })
    expect(preguntasPorPerder(e)).toEqual([{ codigo: 'a', texto: 'A?' }])
  })
  it('otros 400 (sin la lista) o errores no son Protección B', () => {
    expect(preguntasPorPerder(new ApiError(400, 'x', { error: 'x' }))).toBeNull()
    expect(preguntasPorPerder(new ApiError(500, 'x', { preguntasQueSePerderian: [] }))).toBeNull()
    expect(preguntasPorPerder(new Error('x'))).toBeNull()
  })
})
