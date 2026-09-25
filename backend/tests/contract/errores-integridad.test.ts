// T036 (007, US6): manejador central de errores de integridad (D16, FR-023..FR-025, SC-009).
// Cada constraint del mapa de contracts/api.md §4 alcanzable por el cliente se dispara por su ruta real.
import Fastify from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../src/app.js'
import { getPgPool } from '../../src/db/pool.js'
import { registrarManejadorDeErrores, mensajeDeIntegridadPg } from '../../src/http/errores-integridad.js'
import { crearUsuarioDePrueba, limpiarPoolsDePrueba, limpiarUsuariosDePrueba } from '../helpers/db.js'

const PREFIJO = 'test-errint'
const pool = getPgPool()
const TECNICO = /fkey|_key\b|_check|_pkey|violates|constraint|public\.|relation|"\w+_\w+"/i

describe('Contrato: rechazos de integridad → 400 con mensaje claro, no 500', () => {
  let app: FastifyInstance
  let cookie: string
  let orgId: string
  let ufId: string
  let localidadId: number

  const h = () => ({ cookie })
  const post = (url: string, payload: object) => app.inject({ method: 'POST', url, headers: h(), payload })
  const patch = (url: string, payload: object) => app.inject({ method: 'PATCH', url, headers: h(), payload })
  const del = (url: string) => app.inject({ method: 'DELETE', url, headers: h() })
  const claro = (res: { statusCode: number; json: () => { error: string } }, mensaje: string) => {
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toBe(mensaje)
    expect(res.json().error).not.toMatch(TECNICO)
  }

  beforeAll(async () => {
    await limpiarPoolsDePrueba(pool, PREFIJO)
    await limpiarUsuariosDePrueba(pool, PREFIJO)
    app = await buildApp()
    const admin = await crearUsuarioDePrueba(app, `${PREFIJO}-admin@example.observatorio.test`, { rol: 'admin' })
    cookie = admin.cookie
    localidadId = (await pool.query('SELECT id FROM localidades ORDER BY id LIMIT 1')).rows[0].id
    const org = await post('/api/organismos', { denominacion: `${PREFIJO} org`, denominacionSimplificadaId: 1, tipoOficinaId: 1, provinciaId: 1 })
    expect(org.statusCode).toBe(201)
    orgId = org.json().id
    const uf = await post(`/api/organismos/${orgId}/unidades-funcionales`, { denominacionUnidad: `${PREFIJO} uf`, localidadId, tipoUfId: 1 })
    expect(uf.statusCode).toBe(201)
    ufId = uf.json().id
  })
  afterAll(async () => {
    await limpiarPoolsDePrueba(pool, PREFIJO)
    await limpiarUsuariosDePrueba(pool, PREFIJO)
    await app.close()
  })

  it('DELETE de un pool asignado a unidades funcionales: 400 "en uso" y el pool sigue existiendo (FR-023, 005)', async () => {
    const p = (await post('/api/pools-jueces', { provinciaId: 1, descripcion: `${PREFIJO}-pool-uso`, totalJueces: 5 })).json()
    const a = await post(`/api/organismos/${orgId}/unidades-funcionales/${ufId}/asignaciones-jueces`, { grupoJuecesId: p.id, cantidadAsignada: 2 })
    expect(a.statusCode).toBe(201)
    const res = await del(`/api/pools-jueces/${p.id}`)
    claro(res, 'El pool está asignado a unidades funcionales; quitalo de esas asignaciones antes de eliminarlo.')
    expect((await pool.query('SELECT 1 FROM grupos_jueces WHERE id = $1', [p.id])).rowCount).toBe(1)
    // quitada la asignación, el borrado prospera (el rechazo dependía del dato, no de la ruta)
    await del(`/api/organismos/${orgId}/unidades-funcionales/${ufId}/asignaciones-jueces/${a.json().id}`)
    expect((await del(`/api/pools-jueces/${p.id}`)).statusCode).toBe(204)
  })

  it('UF con localidad inexistente: 400 en POST y en PATCH, sin crear ni cambiar nada (FR-024, 005)', async () => {
    claro(
      await post(`/api/organismos/${orgId}/unidades-funcionales`, { denominacionUnidad: `${PREFIJO} uf-x`, localidadId: 999999, tipoUfId: 1 }),
      'La localidad indicada no existe.',
    )
    expect((await pool.query(`SELECT 1 FROM unidades_funcionales WHERE denominacion_unidad = $1`, [`${PREFIJO} uf-x`])).rowCount).toBe(0)
    claro(await patch(`/api/organismos/${orgId}/unidades-funcionales/${ufId}`, { localidadId: 999999 }), 'La localidad indicada no existe.')
    expect((await pool.query('SELECT localidad_id FROM unidades_funcionales WHERE id = $1', [ufId])).rows[0].localidad_id).toBe(localidadId)
  })

  it('tipo de UF, denominación simplificada, tipo de oficina y provincia inexistentes (FR-025)', async () => {
    claro(await post(`/api/organismos/${orgId}/unidades-funcionales`, { denominacionUnidad: 'x', localidadId, tipoUfId: 9999 }), 'El tipo de unidad funcional indicado no existe.')
    claro(await post('/api/organismos', { denominacion: 'x', denominacionSimplificadaId: 9999, tipoOficinaId: 1, provinciaId: 1 }), 'La denominación simplificada indicada no existe.')
    claro(await post('/api/organismos', { denominacion: 'x', denominacionSimplificadaId: 1, tipoOficinaId: 9999, provinciaId: 1 }), 'El tipo de oficina indicado no existe.')
    claro(await post('/api/organismos', { denominacion: 'x', denominacionSimplificadaId: 1, tipoOficinaId: 1, provinciaId: 9999 }), 'La provincia indicada no existe.')
    claro(await patch(`/api/organismos/${orgId}`, { provinciaId: 9999 }), 'La provincia indicada no existe.')
    claro(await post('/api/pools-jueces', { provinciaId: 9999, descripcion: `${PREFIJO}-x`, totalJueces: 1 }), 'La provincia indicada no existe.')
  })

  it('asignación a un pool inexistente y editor inexistente siguen con su mensaje de 006', async () => {
    claro(await post(`/api/organismos/${orgId}/unidades-funcionales/${ufId}/asignaciones-jueces`, { grupoJuecesId: 999999, cantidadAsignada: 1 }), 'El pool de jueces indicado no existe.')
    claro(await post(`/api/organismos/${orgId}/editores`, { usuarioId: 999999999 }), 'El usuario indicado no existe.')
    claro(await post(`/api/organismos/${orgId}/unidades-funcionales/${ufId}/asignaciones-jueces`, { grupoJuecesId: 1, cantidadAsignada: 0 }), 'La cantidad asignada debe ser mayor a 0.')
  })

  it('un valor fuera de rango de la columna (smallint) es rechazo de cliente con mensaje genérico, sin nombres técnicos (FR-025 revisión)', async () => {
    const res = await post('/api/organismos', { denominacion: 'x', denominacionSimplificadaId: 1, tipoOficinaId: 1, provinciaId: 99999 })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toBe('El valor indicado no es válido.')
    const grande = await post('/api/pools-jueces', { provinciaId: 1, descripcion: `${PREFIJO}-g`, totalJueces: 3_000_000_000 })
    expect(grande.statusCode).toBe(400)
    expect(grande.json().error).not.toMatch(TECNICO)
  })

  describe('mapa y respaldo genérico (constraints no alcanzables por HTTP)', () => {
    const pg = (code: string, constraint?: string) => Object.assign(new Error('mensaje técnico de postgres'), { code, constraint })
    it.each([
      ['23503', 'usuario_roles_rol_id_fkey', 'POST', 'El rol indicado no existe.'],
      ['23503', 'usuarios_provincia_id_fkey', 'PATCH', 'La provincia indicada no existe.'],
      ['23505', 'usuarios_email_key', 'POST', 'Ese email ya está dado de alta.'],
      ['23503', 'unidad_funcional_grupo_jueces_grupo_jueces_id_fkey', 'DELETE', 'El pool está asignado a unidades funcionales; quitalo de esas asignaciones antes de eliminarlo.'],
      ['23503', 'unidad_funcional_grupo_jueces_grupo_jueces_id_fkey', 'POST', 'El pool de jueces indicado no existe.'],
      // sin constraint mapeado: genérico por tipo, y por método para 23503
      ['23503', 'una_fk_que_no_conocemos_fkey', 'POST', 'El dato indicado no existe.'],
      ['23503', 'una_fk_que_no_conocemos_fkey', 'DELETE', 'El registro está en uso y no puede eliminarse.'],
      ['23505', 'algo_key', 'POST', 'Ya existe un registro con esos datos.'],
      ['23514', 'algo_check', 'PATCH', 'El valor indicado está fuera de lo permitido.'],
      ['23502', undefined, 'POST', 'Falta un dato obligatorio.'],
      ['22003', undefined, 'POST', 'El valor indicado no es válido.'],
    ])('%s %s (%s) → %s', (code, constraint, metodo, esperado) => {
      const msg = mensajeDeIntegridadPg(pg(code as string, constraint as string | undefined), metodo as string)
      expect(msg).toBe(esperado)
      expect(msg).not.toMatch(TECNICO)
    })
  })

  describe('lo inesperado sigue siendo 500 (FR-025, US6-4)', () => {
    it('un Error cualquiera y un error de Postgres que no es de datos (conexión) responden 500', async () => {
      const mini = Fastify()
      registrarManejadorDeErrores(mini)
      mini.get('/boom', async () => { throw new Error('falla inesperada') })
      mini.get('/conexion', async () => { throw Object.assign(new Error('terminating connection'), { code: '57P01' }) })
      mini.get('/integridad', async () => { throw Object.assign(new Error('x'), { code: '23505', constraint: 'usuarios_email_key' }) })
      expect((await mini.inject({ url: '/boom' })).statusCode).toBe(500)
      expect((await mini.inject({ url: '/conexion' })).statusCode).toBe(500)
      const ok = await mini.inject({ url: '/integridad' })
      expect(ok.statusCode).toBe(400)
      expect(ok.json()).toEqual({ error: 'Ese email ya está dado de alta.' })
      // el 500 no filtra el mensaje interno
      expect((await mini.inject({ url: '/boom' })).body).not.toContain('falla inesperada')
      await mini.close()
    })
  })
})
