// T021 (007, US3): el sistema nunca queda sin administradores (FR-014, SC-006), incluida la carrera entre
// dos degradaciones simultáneas de los dos últimos admins (Decisión 5, bloqueo FOR UPDATE).
// Se prueba en un ESQUEMA AISLADO (copias de usuarios/usuario_roles/roles con search_path propio) para no
// tocar jamás el rol de los administradores reales de la base.
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { loadPgConfig } from '../../src/config/env.js'
import { cambiarRol } from '../../src/services/usuarios.js'
import { ErrorNegocio } from '../../src/http/errores-integridad.js'

const ESQUEMA = 'test_007_ultimo_admin'
let admin: pg.Pool // con search_path aislado: el que usa el servicio
let base: pg.Pool // público, solo para armar/limpiar el esquema

const adminsEnAislado = async () =>
  (await admin.query(`SELECT count(*)::int n FROM usuario_roles WHERE rol_id = (SELECT id FROM roles WHERE nombre='admin')`)).rows[0].n as number
const idDe = async (email: string) => (await admin.query(`SELECT id::text FROM usuarios WHERE email = $1`, [email])).rows[0].id as string
const rechazo = async (p: Promise<unknown>) => {
  try {
    await p
  } catch (e) {
    return e as ErrorNegocio
  }
  return null
}

async function reponerAdmins(...emails: string[]) {
  await admin.query(`DELETE FROM usuario_roles`)
  for (const e of emails) {
    const id = await idDe(e)
    await admin.query(`INSERT INTO usuario_roles (usuario_id, rol_id) SELECT $1, id FROM roles`, [id])
  }
}

describe('Último administrador (esquema aislado)', () => {
  beforeAll(async () => {
    const { connectionString } = loadPgConfig()
    base = new pg.Pool({ connectionString })
    await base.query(`DROP SCHEMA IF EXISTS ${ESQUEMA} CASCADE`)
    await base.query(`CREATE SCHEMA ${ESQUEMA}`)
    for (const t of ['roles', 'usuarios', 'usuario_roles']) {
      await base.query(`CREATE TABLE ${ESQUEMA}.${t} (LIKE public.${t} INCLUDING DEFAULTS INCLUDING IDENTITY INCLUDING CONSTRAINTS INCLUDING INDEXES)`)
    }
    await base.query(`INSERT INTO ${ESQUEMA}.roles OVERRIDING SYSTEM VALUE SELECT * FROM public.roles`)
    await base.query(
      `INSERT INTO ${ESQUEMA}.usuarios (email, firestore_id) VALUES ('a@t.test','a'),('b@t.test','b'),('n@t.test','n')`,
    )
    admin = new pg.Pool({ connectionString, options: `-c search_path=${ESQUEMA}` })
  })
  afterAll(async () => {
    await admin?.end()
    await base.query(`DROP SCHEMA IF EXISTS ${ESQUEMA} CASCADE`)
    await base.end()
  })

  it('el único admin no puede perder el rol, ni por sí mismo ni por otro camino (FR-014)', async () => {
    await reponerAdmins('a@t.test')
    const e = await rechazo(cambiarRol(admin, await idDe('a@t.test'), 'usuario_normal'))
    expect(e).toBeInstanceOf(ErrorNegocio)
    expect(e!.statusCode).toBe(400)
    expect(e!.message).toBe('El sistema no puede quedarse sin administradores.')
    expect(await adminsEnAislado()).toBe(1)
  })

  it('con dos admins, degradar a uno es válido y el otro pasa a ser el último (US3-2/4)', async () => {
    await reponerAdmins('a@t.test', 'b@t.test')
    const r = await cambiarRol(admin, await idDe('a@t.test'), 'usuario_normal')
    expect(r.roles).toEqual(['usuario_normal'])
    expect(await adminsEnAislado()).toBe(1)
    const e = await rechazo(cambiarRol(admin, await idDe('b@t.test'), 'usuario_normal'))
    expect(e?.message).toBe('El sistema no puede quedarse sin administradores.')
  })

  it('degradar a alguien que no es admin no cambia nada ni se rechaza aunque quede un solo admin', async () => {
    await reponerAdmins('a@t.test')
    const r = await cambiarRol(admin, await idDe('n@t.test'), 'usuario_normal')
    expect(r.roles).toEqual(['usuario_normal'])
    expect(await adminsEnAislado()).toBe(1)
  })

  it('carrera: dos degradaciones simultáneas de los dos últimos admins → una prospera y la otra se rechaza; nunca 0 (SC-006)', async () => {
    for (let i = 0; i < 25; i++) {
      await reponerAdmins('a@t.test', 'b@t.test')
      const [ida, idb] = [await idDe('a@t.test'), await idDe('b@t.test')]
      const r = await Promise.allSettled([cambiarRol(admin, ida, 'usuario_normal'), cambiarRol(admin, idb, 'usuario_normal')])
      expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1)
      const rej = r.find((x) => x.status === 'rejected') as PromiseRejectedResult
      expect((rej.reason as Error).message).toBe('El sistema no puede quedarse sin administradores.')
      expect(await adminsEnAislado()).toBe(1)
    }
  })
})
