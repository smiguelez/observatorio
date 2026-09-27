// Corrección retroactiva de organismos.denominacion y unidades_funcionales.denominacion_unidad
// con la misma regla que ya aplica en escritura (src/util/denominaciones.ts).
//
// Por defecto es un DRY RUN: solo imprime la lista completa de antes/después y no toca la base.
// Recién actualiza filas con --aplicar, y solo update-ea las filas cuyo valor normalizado difiere
// del actual (no re-escribe las que ya están bien).
import { getPgPool, closePgPool } from '../src/db/pool.js'
import { normalizarDenominacion } from '../src/util/denominaciones.js'

const APLICAR = process.argv.includes('--aplicar')

interface Cambio {
  tabla: string
  id: number
  antes: string
  despues: string
}

async function relevar(): Promise<Cambio[]> {
  const pool = getPgPool()
  const cambios: Cambio[] = []

  const { rows: organismos } = await pool.query<{ id: number; denominacion: string }>(
    'SELECT id, denominacion FROM organismos ORDER BY id',
  )
  for (const o of organismos) {
    const despues = normalizarDenominacion(o.denominacion)
    if (despues !== o.denominacion) cambios.push({ tabla: 'organismos', id: o.id, antes: o.denominacion, despues })
  }

  const { rows: unidades } = await pool.query<{ id: number; denominacion_unidad: string }>(
    'SELECT id, denominacion_unidad FROM unidades_funcionales ORDER BY id',
  )
  for (const u of unidades) {
    const despues = normalizarDenominacion(u.denominacion_unidad)
    if (despues !== u.denominacion_unidad) {
      cambios.push({ tabla: 'unidades_funcionales', id: u.id, antes: u.denominacion_unidad, despues })
    }
  }

  return cambios
}

async function main() {
  const cambios = await relevar()
  const pool = getPgPool()

  const { rows: totalOrg } = await pool.query<{ n: string }>('SELECT count(*) AS n FROM organismos')
  const { rows: totalUf } = await pool.query<{ n: string }>('SELECT count(*) AS n FROM unidades_funcionales')

  console.log(`[normalizar-denominaciones] organismos: ${totalOrg[0]!.n} filas, unidades_funcionales: ${totalUf[0]!.n} filas.`)
  console.log(`[normalizar-denominaciones] ${cambios.length} denominación(es) cambian con la regla nueva:\n`)

  for (const c of cambios) {
    console.log(`${c.tabla}#${c.id}`)
    console.log(`  antes:   ${JSON.stringify(c.antes)}`)
    console.log(`  después: ${JSON.stringify(c.despues)}\n`)
  }

  if (!APLICAR) {
    console.log(`[normalizar-denominaciones] DRY RUN — no se escribió nada. Correr con --aplicar para aplicar estos ${cambios.length} cambios.`)
    return
  }

  console.log(`[normalizar-denominaciones] --aplicar: escribiendo ${cambios.length} cambio(s)...`)
  for (const c of cambios) {
    const tabla = c.tabla === 'organismos' ? 'organismos' : 'unidades_funcionales'
    const columna = c.tabla === 'organismos' ? 'denominacion' : 'denominacion_unidad'
    await pool.query(`UPDATE ${tabla} SET ${columna} = $1 WHERE id = $2`, [c.despues, c.id])
  }
  console.log('[normalizar-denominaciones] Listo.')
}

main()
  .catch((err) => {
    console.error('[normalizar-denominaciones] ERROR:', err)
    process.exitCode = 1
  })
  .finally(async () => {
    await closePgPool()
  })
