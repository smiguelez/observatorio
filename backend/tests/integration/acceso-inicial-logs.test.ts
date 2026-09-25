// T027 (007, US4): el acceso inicial NO queda registrado en los logs del servidor (FR-022, Decisión 3).
import { Writable } from 'node:stream'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../src/app.js'
import { getPgPool } from '../../src/db/pool.js'
import { crearUsuarioDePrueba, limpiarUsuariosDePrueba } from '../helpers/db.js'

const PREFIJO = 'test-acceso-logs'
const pool = getPgPool()
const email = (n: string) => `${PREFIJO}-${n}@example.observatorio.test`

describe('El acceso inicial no aparece en los logs', () => {
  let app: FastifyInstance
  const capturado: string[] = []

  beforeAll(async () => {
    await limpiarUsuariosDePrueba(pool, PREFIJO)
    const sumidero = new Writable({ write(chunk, _enc, cb) { capturado.push(String(chunk)); cb() } })
    app = await buildApp({ logStream: sumidero })
  })
  afterAll(async () => {
    vi.restoreAllMocks()
    await limpiarUsuariosDePrueba(pool, PREFIJO)
    await app.close()
  })

  it('ni el token ni la contraseña se registran durante alta, reemisión, canje válido, canje inválido y canje con política inválida', async () => {
    const consola = vi.spyOn(console, 'log').mockImplementation(() => {})
    const admin = await crearUsuarioDePrueba(app, email('admin'), { rol: 'admin' })
    const alta = (await app.inject({
      method: 'POST', url: '/api/usuarios', headers: { cookie: admin.cookie },
      payload: { email: email('u'), rol: 'usuario_normal', provinciaId: 2 },
    })).json()
    const reemitido = (await app.inject({ method: 'POST', url: `/api/usuarios/${alta.id}/acceso-inicial`, headers: { cookie: admin.cookie } })).json()
    const secretos = [alta.accesoInicial.token as string, reemitido.token as string, 'clave-secreta-de-prueba-1', 'corta', 'token-falso-1234567890']

    await app.inject({ method: 'POST', url: '/api/acceso-inicial/canjear', payload: { token: alta.accesoInicial.token, password: 'clave-secreta-de-prueba-1' } }) // reemplazado
    await app.inject({ method: 'POST', url: '/api/acceso-inicial/canjear', payload: { token: 'token-falso-1234567890', password: 'clave-secreta-de-prueba-1' } })
    await app.inject({ method: 'POST', url: '/api/acceso-inicial/canjear', payload: { token: reemitido.token, password: 'corta' } })
    const ok = await app.inject({ method: 'POST', url: '/api/acceso-inicial/canjear', payload: { token: reemitido.token, password: 'clave-secreta-de-prueba-1' } })
    expect(ok.statusCode).toBe(200)

    const log = capturado.join('')
    expect(log.length).toBeGreaterThan(0) // se capturó algo: la prueba no es vacía
    expect(log).toContain('/api/acceso-inicial/canjear') // …incluido el canje
    for (const s of secretos) expect(log).not.toContain(s)
    const salidaConsola = consola.mock.calls.map((c) => c.join(' ')).join('\n')
    for (const s of secretos) expect(salidaConsola).not.toContain(s)
  })
})
