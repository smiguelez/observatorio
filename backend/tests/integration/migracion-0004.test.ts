// T042 (007, US7): la migración 0004 reemplaza los mensajes de los triggers de taxonomía (D18) y su `down`
// restaura los originales. Se prueba DENTRO de una transacción que siempre se revierte: no deja rastro
// aunque `up`/`down` se ejecuten dos veces, y no depende de haber aplicado la migración en firme.
import { afterAll, describe, expect, it } from 'vitest'
import { sql, type Kysely, type Transaction } from 'kysely'
import { getPublicKysely } from '../../src/db/kysely.js'
import { closePgPool } from '../../src/db/pool.js'
import { up, down } from '../../migrations/0004_taxonomia_mensajes_legibles.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = Kysely<any>
const Rollback = new Error('rollback-intencional')

// Ejecuta `fn` dentro de una transacción y la revierte siempre.
async function enTransaccionDescartable(fn: (trx: Transaction<any>) => Promise<void>) { // eslint-disable-line @typescript-eslint/no-explicit-any
  try {
    await (getPublicKysely() as Db).transaction().execute(async (trx) => {
      await fn(trx)
      throw Rollback
    })
  } catch (e) {
    if (e !== Rollback) throw e
  }
}

// Provoca un rechazo del trigger y devuelve { message, detail } (savepoint: la transacción sigue viva).
async function provocar(trx: Db, dml: ReturnType<typeof sql>) {
  await sql`SAVEPOINT s`.execute(trx)
  try {
    await dml.execute(trx)
    throw new Error('se esperaba un rechazo del trigger')
  } catch (e) {
    const err = (e as { cause?: unknown }).cause ?? e
    const { message, detail } = err as { message: string; detail?: string }
    await sql`ROLLBACK TO SAVEPOINT s`.execute(trx)
    return { message, detail }
  }
}

const ID_INTERNO = /pregunta_id|opcion_id|tipo_oficina_id|evaluaciones_taxonomicas|organismo_id|\bFR-\d|Protección|\b\d+\b/

async function fixtures(trx: Db) {
  const org = await sql<{ id: number }>`
    INSERT INTO organismos (denominacion, denominacion_simplificada_id, tipo_oficina_id, provincia_id, propietario_id, estado_fueros, actualizado_a, firestore_id)
    VALUES ('mig0004 org', 1, 1, 1, (SELECT min(id) FROM usuarios), 'sin_fueros_asignados', now(), 'api:mig0004') RETURNING id`.execute(trx)
  const preg = async (codigo: string, texto: string, tipo: string) =>
    (await sql<{ id: number }>`
      INSERT INTO taxonomia_preguntas (codigo, texto, grupo, tipo_respuesta, orden) VALUES (${codigo}, ${texto}, 'gestion', ${tipo}, 900)
      RETURNING id`.execute(trx)).rows[0]!.id
  const aplica = (id: number) => sql`INSERT INTO taxonomia_pregunta_tipos_oficina (pregunta_id, tipo_oficina_id) VALUES (${id}, 1)`.execute(trx)
  const opUnica = await preg('mig0004_unica', 'Pregunta única de prueba', 'opcion_unica')
  const numerica = await preg('mig0004_num', 'mig0004_num', 'numerica')
  const noAplica = await preg('mig0004_noaplica', 'mig0004_noaplica', 'opcion_unica')
  await aplica(opUnica)
  await aplica(numerica)
  const op = (await sql<{ id: number }>`INSERT INTO taxonomia_opciones (pregunta_id, codigo, etiqueta, orden) VALUES (${opUnica}, 'S', 'Sí', 1), (${opUnica}, 'N', 'No', 2) RETURNING id`.execute(trx)).rows
  const otraOp = (await sql<{ id: number }>`INSERT INTO taxonomia_opciones (pregunta_id, codigo, etiqueta, orden) VALUES (${noAplica}, 'Z', 'Z', 1) RETURNING id`.execute(trx)).rows[0]!.id
  return { orgId: org.rows[0]!.id, opUnica, numerica, noAplica, op1: op[0]!.id, op2: op[1]!.id, otraOp }
}

describe('Migración 0004: mensajes de triggers de taxonomía', () => {
  afterAll(async () => {
    await closePgPool()
  })

  it('con 0004 aplicada, cada rechazo identifica la pregunta por código/texto y por DETAIL, sin ids ni tablas (FR-026/027, SC-010)', async () => {
    await enTransaccionDescartable(async (trx) => {
      await down(trx) // parte de la definición original, para que el test valga aunque 0004 ya esté aplicada
      await up(trx)
      const f = await fixtures(trx)
      const ins = (p: number, cols: string, vals: unknown[]) =>
        sql`INSERT INTO evaluaciones_taxonomicas (organismo_id, pregunta_id, ${sql.raw(cols)}) VALUES (${f.orgId}, ${p}, ${sql.join(vals)})`

      const noAplica = await provocar(trx, ins(f.noAplica, 'opcion_id', [f.otraOp]))
      expect(noAplica.message).toBe('La pregunta «mig0004_noaplica» no aplica al tipo de organismo actual.')
      expect(noAplica.detail).toBe('preguntaCodigo=mig0004_noaplica')

      const ajena = await provocar(trx, ins(f.opUnica, 'opcion_id', [f.otraOp]))
      expect(ajena.message).toBe('La opción indicada no pertenece a la pregunta «mig0004_unica» (Pregunta única de prueba).')
      expect(ajena.detail).toBe('preguntaCodigo=mig0004_unica')

      const tipo = await provocar(trx, ins(f.opUnica, 'valor_numero', [5]))
      expect(tipo.message).toBe('La pregunta «mig0004_unica» (Pregunta única de prueba) admite una opción; se recibió un valor de otro tipo.')
      const num = await provocar(trx, ins(f.numerica, 'valor_texto', ['hola']))
      expect(num.message).toBe('La pregunta «mig0004_num» admite un valor numérico; se recibió un valor de otro tipo.')
      expect(num.detail).toBe('preguntaCodigo=mig0004_num')

      await ins(f.opUnica, 'opcion_id', [f.op1]).execute(trx)
      const dup = await provocar(trx, ins(f.opUnica, 'opcion_id', [f.op2]))
      expect(dup.message).toBe('La pregunta «mig0004_unica» (Pregunta única de prueba) admite una sola respuesta.')
      expect(dup.detail).toBe('preguntaCodigo=mig0004_unica')

      for (const r of [noAplica, ajena, tipo, num, dup]) expect(r.message).not.toMatch(ID_INTERNO)
    })
  })

  it('con el `down` aplicado se ven los mensajes originales (reversibilidad)', async () => {
    await enTransaccionDescartable(async (trx) => {
      await down(trx) // (idempotente) parte de un estado conocido aunque 0004 ya esté aplicada
      await up(trx)
      await down(trx)
      const f = await fixtures(trx)
      const r = await provocar(trx, sql`INSERT INTO evaluaciones_taxonomicas (organismo_id, pregunta_id, opcion_id) VALUES (${f.orgId}, ${f.noAplica}, ${f.otraOp})`)
      expect(r.message).toMatch(/^evaluaciones_taxonomicas: la pregunta \d+ no aplica al tipo de organismo actual \(tipo_oficina_id=1\)/)
      expect(r.detail).toBeUndefined()
      const existe = await sql<{ n: number }>`SELECT count(*)::int n FROM pg_proc WHERE proname = 'taxonomia_pregunta_rotulo'`.execute(trx)
      expect(existe.rows[0]!.n).toBe(0) // el down elimina la función auxiliar
    })
  })
})
