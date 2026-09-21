// T027 (US2): remover a un editor le quita acceso en su siguiente
// solicitud, SIN re-login (SC-007). La sesión de E no cambia en ningún
// momento de este test — lo único que cambia es la fila de
// organismo_editores, y eso alcanza porque la autorización se relee de la
// base en cada request (FR-002), nunca se cachea en la sesión.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../src/app.js'
import { getPgPool } from '../../src/db/pool.js'
import { crearUsuarioDePrueba, limpiarUsuariosDePrueba } from '../helpers/db.js'

const PREFIJO = 'test-organismos-revocacion'
const pool = getPgPool()

describe('Revocación de editor sin re-login (SC-007)', () => {
  let app: FastifyInstance
  let cookiePropietario: string
  let cookieEditor: string
  let editorId: string
  let organismoId: string

  beforeAll(async () => {
    await limpiarUsuariosDePrueba(pool, PREFIJO)
    app = await buildApp()

    const propietario = await crearUsuarioDePrueba(app, `${PREFIJO}-propietario@example.observatorio.test`)
    const editor = await crearUsuarioDePrueba(app, `${PREFIJO}-editor@example.observatorio.test`)
    cookiePropietario = propietario.cookie
    cookieEditor = editor.cookie
    editorId = editor.usuarioId

    const creado = await app.inject({
      method: 'POST',
      url: '/api/organismos',
      headers: { cookie: cookiePropietario },
      payload: {
        denominacion: 'Organismo con editor',
        denominacionSimplificadaId: 1,
        tipoOficinaId: 1,
        provinciaId: 1,
      },
    })
    organismoId = creado.json().id

    // No existe (todavía) un endpoint de "agregar editor" en esta historia
    // — se agrega directo por SQL, que es la relación real que evalúa
    // esOwnerOEditor(), no un atajo del test.
    await pool.query('INSERT INTO organismo_editores (organismo_id, usuario_id) VALUES ($1, $2)', [
      organismoId,
      editorId,
    ])
  })

  afterAll(async () => {
    await limpiarUsuariosDePrueba(pool, PREFIJO)
    await app.close()
  })

  it('el editor tiene acceso, se lo remueve, y la MISMA sesión pierde acceso en la siguiente solicitud', async () => {
    const antes = await app.inject({
      method: 'GET',
      url: `/api/organismos/${organismoId}`,
      headers: { cookie: cookieEditor },
    })
    expect(antes.statusCode).toBe(200)

    await pool.query('DELETE FROM organismo_editores WHERE organismo_id = $1 AND usuario_id = $2', [
      organismoId,
      editorId,
    ])

    // Misma cookie, ninguna acción de logout/login de por medio.
    const despues = await app.inject({
      method: 'GET',
      url: `/api/organismos/${organismoId}`,
      headers: { cookie: cookieEditor },
    })
    expect(despues.statusCode).toBe(403)

    const patchDespues = await app.inject({
      method: 'PATCH',
      url: `/api/organismos/${organismoId}`,
      headers: { cookie: cookieEditor },
      payload: { denominacion: 'Intento post-revocación' },
    })
    expect(patchDespues.statusCode).toBe(403)

    // Confirmación de que la sesión en sí sigue viva (no es que expiró) —
    // el propietario, que nunca perdió nada, sigue pudiendo.
    const propietarioSigue = await app.inject({
      method: 'GET',
      url: `/api/organismos/${organismoId}`,
      headers: { cookie: cookiePropietario },
    })
    expect(propietarioSigue.statusCode).toBe(200)
  })
})
