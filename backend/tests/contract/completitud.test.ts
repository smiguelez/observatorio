// 009: GET /api/organismos/completitud — la completitud de todos los organismos en UNA consulta SQL.
// La regla es la MISMA que calculaba el cliente (frontend/src/features/completitud/calcular.ts, US7 de 005): la prueba central
// («equivalencia») recalcula, para TODOS los organismos de la base, la regla con la técnica ANTERIOR (varias llamadas por organismo a los
// endpoints existentes) y exige que el endpoint nuevo dé exactamente lo mismo.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../src/app.js'
import { getPgPool } from '../../src/db/pool.js'
import { crearUsuarioDePrueba, limpiarUsuariosDePrueba } from '../helpers/db.js'

const PREFIJO = 'test-contract-completitud'
const pool = getPgPool()
const email = (n: string) => `${PREFIJO}-${n}@example.observatorio.test`

interface Fila {
  organismoId: string
  denominacion: string
  tipoOficinaId: number
  provinciaId: number
  datosBasicos: boolean
  unidades: boolean
  catalogoVacio: boolean
  taxonomia: boolean
  completo: boolean
}

// La regla ANTERIOR, tal cual estaba en el cliente (calcular.ts), alimentada con los endpoints por organismo.
function reglaAnterior(e: { denominacion: string; denominacionSimplificadaId: number; tipoOficinaId: number; provinciaId: number; cantidadUnidades: number; catalogoVacio: boolean; cantidadRespuestas: number }) {
  const datosBasicos = e.denominacion.trim() !== '' && e.denominacionSimplificadaId > 0 && e.tipoOficinaId > 0 && e.provinciaId > 0
  const unidades = e.cantidadUnidades >= 1
  const taxonomia = e.catalogoVacio || e.cantidadRespuestas >= 1
  return { datosBasicos, unidades, taxonomia, completo: datosBasicos && unidades && taxonomia }
}

describe('Contrato: completitud de organismos (009)', () => {
  let app: FastifyInstance
  let cookieAdmin: string
  let cookieDueno: string
  let cookieEditor: string
  let cookieAjeno: string
  const ids: Record<string, string> = {}
  let localidadId: number

  const get = (url: string, cookie?: string) => app.inject({ method: 'GET', url, headers: cookie ? { cookie } : {} })
  const completitud = async (cookie: string) => (await get('/api/organismos/completitud', cookie)).json() as Fila[]
  const post = (url: string, cookie: string, payload: object) => app.inject({ method: 'POST', url, headers: { cookie }, payload })

  beforeAll(async () => {
    await limpiarUsuariosDePrueba(pool, PREFIJO)
    app = await buildApp()
    cookieAdmin = (await crearUsuarioDePrueba(app, email('admin'), { rol: 'admin' })).cookie
    const dueno = await crearUsuarioDePrueba(app, email('dueno'))
    cookieDueno = dueno.cookie
    const editor = await crearUsuarioDePrueba(app, email('editor'))
    cookieEditor = editor.cookie
    cookieAjeno = (await crearUsuarioDePrueba(app, email('ajeno'))).cookie
    localidadId = (await pool.query('SELECT id FROM localidades ORDER BY id LIMIT 1')).rows[0].id

    const crear = async (clave: string, tipo: number, opciones: { uf?: boolean; denominacion?: string } = {}) => {
      const r = await post('/api/organismos', cookieDueno, {
        denominacion: opciones.denominacion ?? `${PREFIJO} ${clave}`, denominacionSimplificadaId: 1, tipoOficinaId: tipo, provinciaId: 1,
      })
      expect(r.statusCode).toBe(201)
      ids[clave] = r.json().id
      if (opciones.uf) {
        const uf = await post(`/api/organismos/${ids[clave]}/unidades-funcionales`, cookieDueno, { denominacionUnidad: 'uf', localidadId, tipoUfId: 1 })
        expect(uf.statusCode).toBe(201)
      }
    }
    await crear('completo', 1, { uf: true })
    const pregunta = (await get('/api/taxonomia/preguntas?tipoOficinaId=1', cookieDueno)).json()[0] as { codigo: string; opciones: { codigo: string }[] }
    const put = await app.inject({
      method: 'PUT', url: `/api/organismos/${ids.completo}/taxonomia`, headers: { cookie: cookieDueno },
      payload: { respuestas: [{ preguntaCodigo: pregunta.codigo, opcionesCodigos: [pregunta.opciones[0]!.codigo] }] },
    })
    expect(put.statusCode).toBe(200)
    await crear('sin-uf', 1)
    await crear('sin-taxonomia', 1, { uf: true })
    await crear('coordinacion', 3, { uf: true }) // tipo SIN preguntas aplicables: la taxonomía cuenta como completa con 0 respuestas
    await crear('coordinacion-sin-uf', 3)
    await crear('unidad-operativa', 4, { uf: true })
    await crear('denominacion-en-blanco', 1, { uf: true, denominacion: '   ' })
    // el editor edita 'sin-uf' (no es propietario)
    await pool.query('INSERT INTO organismo_editores (organismo_id, usuario_id) VALUES ($1, $2)', [ids['sin-uf'], editor.usuarioId])
  })
  afterAll(async () => {
    await limpiarUsuariosDePrueba(pool, PREFIJO)
    await app.close()
  })

  it('sin sesión da 401 (FR-004)', async () => {
    expect((await get('/api/organismos/completitud')).statusCode).toBe(401)
  })

  it('devuelve un arreglo ordenado por id, con la forma del contrato y el id bigint como string', async () => {
    const filas = await completitud(cookieAdmin)
    expect(Array.isArray(filas)).toBe(true)
    for (const f of filas) {
      expect(Object.keys(f).sort()).toEqual(['catalogoVacio', 'completo', 'datosBasicos', 'denominacion', 'organismoId', 'provinciaId', 'taxonomia', 'tipoOficinaId', 'unidades'])
      expect(f.organismoId).toMatch(/^\d+$/)
      for (const k of ['datosBasicos', 'unidades', 'catalogoVacio', 'taxonomia', 'completo'] as const) expect(typeof f[k]).toBe('boolean')
    }
    const idsEnOrden = filas.map((f) => BigInt(f.organismoId))
    expect(idsEnOrden).toEqual([...idsEnOrden].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)))
  })

  it('la ruta estática no la captura /api/organismos/:id (no responde 404 "No encontrado" de un organismo)', async () => {
    const r = await get('/api/organismos/completitud', cookieAdmin)
    expect(r.statusCode).toBe(200)
  })

  it.each([
    ['completo', { datosBasicos: true, unidades: true, catalogoVacio: false, taxonomia: true, completo: true }],
    ['sin-uf', { datosBasicos: true, unidades: false, catalogoVacio: false, taxonomia: false, completo: false }],
    ['sin-taxonomia', { datosBasicos: true, unidades: true, catalogoVacio: false, taxonomia: false, completo: false }],
    ['coordinacion', { datosBasicos: true, unidades: true, catalogoVacio: true, taxonomia: true, completo: true }],
    ['coordinacion-sin-uf', { datosBasicos: true, unidades: false, catalogoVacio: true, taxonomia: true, completo: false }],
    ['unidad-operativa', { datosBasicos: true, unidades: true, catalogoVacio: true, taxonomia: true, completo: true }],
    ['denominacion-en-blanco', { datosBasicos: false, unidades: true, catalogoVacio: false, taxonomia: false, completo: false }],
  ])('caso «%s»: aplica la regla de completitud de US7', async (clave, esperado) => {
    const fila = (await completitud(cookieAdmin)).find((f) => f.organismoId === ids[clave])!
    expect(fila).toMatchObject(esperado)
  })

  it('EQUIVALENCIA: para TODOS los organismos de la base da exactamente lo que daba el cálculo por organismo (misma regla)', async () => {
    const filas = await completitud(cookieAdmin)
    expect(filas.length).toBe((await pool.query('SELECT count(*)::int n FROM organismos')).rows[0].n)
    const catalogoVacioPorTipo = new Map<number, boolean>()
    let comparadas = 0
    for (const f of filas) {
      const org = (await get(`/api/organismos/${f.organismoId}`, cookieAdmin)).json()
      const unidades = (await get(`/api/organismos/${f.organismoId}/unidades-funcionales`, cookieAdmin)).json() as unknown[]
      if (!catalogoVacioPorTipo.has(org.tipo_oficina_id)) {
        const cat = (await get(`/api/taxonomia/preguntas?tipoOficinaId=${org.tipo_oficina_id}`, cookieAdmin)).json() as unknown[]
        catalogoVacioPorTipo.set(org.tipo_oficina_id, cat.length === 0)
      }
      const vacio = catalogoVacioPorTipo.get(org.tipo_oficina_id)!
      // Igual que el cliente: las respuestas solo se piden si el tipo tiene preguntas.
      const respuestas = vacio ? 0 : ((await get(`/api/organismos/${f.organismoId}/taxonomia`, cookieAdmin)).json() as unknown[]).length
      const esperado = reglaAnterior({
        denominacion: org.denominacion, denominacionSimplificadaId: org.denominacion_simplificada_id, tipoOficinaId: org.tipo_oficina_id,
        provinciaId: org.provincia_id, cantidadUnidades: unidades.length, catalogoVacio: vacio, cantidadRespuestas: respuestas,
      })
      expect({ ...f }).toEqual({
        organismoId: String(org.id), denominacion: org.denominacion, tipoOficinaId: org.tipo_oficina_id, provinciaId: org.provincia_id,
        catalogoVacio: vacio, ...esperado,
      })
      comparadas++
    }
    expect(comparadas).toBeGreaterThan(100) // universo real (118) + fixtures: la prueba no es vacía
  }, 120_000)

  it('visibilidad = la de GET /api/organismos: el propietario ve los suyos, el editor los que edita, un ajeno ninguno (Principio II)', async () => {
    const delDueno = (await completitud(cookieDueno)).map((f) => f.organismoId).sort()
    const listaDueno = ((await get('/api/organismos', cookieDueno)).json() as { id: string }[]).map((o) => o.id).sort()
    expect(delDueno).toEqual(listaDueno)
    expect(delDueno).toEqual(Object.values(ids).sort())
    expect((await completitud(cookieEditor)).map((f) => f.organismoId)).toEqual([ids['sin-uf']])
    expect(await completitud(cookieAjeno)).toEqual([])
    const admin = await completitud(cookieAdmin)
    const todos = (await pool.query('SELECT o.id::text AS id FROM organismos o ORDER BY o.id')).rows.map((r) => r.id)
    expect(admin.map((f) => f.organismoId)).toEqual(todos)
  })

  it('UNA sola consulta agregada, sin N+1: la cantidad de consultas no depende de cuántos organismos hay', async () => {
    const espiar = async (cookie: string) => {
      const spy = vi.spyOn(pool, 'query')
      const r = await get('/api/organismos/completitud', cookie)
      const textos = spy.mock.calls.map((c) => (typeof c[0] === 'string' ? c[0] : String((c[0] as { text?: string })?.text ?? '')))
      spy.mockRestore()
      return { filas: (r.json() as unknown[]).length, tocandoUnidades: textos.filter((t) => t.includes('unidades_funcionales')).length, tocandoTaxonomia: textos.filter((t) => t.includes('evaluaciones_taxonomicas')).length }
    }
    const admin = await espiar(cookieAdmin) // ~125 organismos
    const dueno = await espiar(cookieDueno) // 7
    const ajeno = await espiar(cookieAjeno) // 0
    expect(admin.filas).toBeGreaterThan(100)
    for (const r of [admin, dueno, ajeno]) expect(r).toMatchObject({ tocandoUnidades: 1, tocandoTaxonomia: 1 }) // la MISMA consulta, no una por fila
  })
})
