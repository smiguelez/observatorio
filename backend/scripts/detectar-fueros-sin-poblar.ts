// 011 (research.md, Decisión 3): detector de una sola vez, NO un rellenador — a diferencia de
// normalizar-denominaciones.ts, acá no hay ningún flag `--aplicar`: `fuero_simplificado` es 100% una
// vista calculada desde `organismo_fueros` (db/schema.sql), no un dato guardado aparte, así que si
// apareciera un organismo `cargado` con 0 filas en `organismo_fueros` no hay ningún valor original
// del que copiar el fuero — el único curso de acción honesto es listarlo para resolución manual
// (mismo criterio que el runbook de corte: "el código detecta y se detiene, una persona decide"),
// nunca inventar una distribución.
//
// Verificado contra la base real al planificar esta feature (2026-09-28): 0 casos. Se deja este
// script como red de seguridad, por si alguna vía futura (otra fuente de datos, un bug en una carga
// posterior) produjera el caso.
import { getPgPool, closePgPool } from '../src/db/pool.js'

async function main() {
  const pool = getPgPool()
  const { rows } = await pool.query<{ id: number; denominacion: string }>(
    `SELECT o.id, o.denominacion
       FROM organismos o
       LEFT JOIN organismo_fueros ofu ON ofu.organismo_id = o.id
      WHERE o.estado_fueros = 'cargado'
      GROUP BY o.id, o.denominacion
     HAVING count(ofu.fuero_id) = 0
      ORDER BY o.id`,
  )

  if (rows.length === 0) {
    console.log('[detectar-fueros-sin-poblar] 0 organismos "cargado" con el listado de fueros vacío.')
    return
  }

  console.log(`[detectar-fueros-sin-poblar] ${rows.length} organismo(s) "cargado" con el listado de fueros VACÍO — no hay de dónde`)
  console.log('copiar el fuero (fuero_simplificado es una vista calculada, no un dato guardado aparte); requieren resolución manual:')
  for (const r of rows) console.log(`  organismo #${r.id} — ${r.denominacion}`)
}

main()
  .catch((err) => {
    console.error('[detectar-fueros-sin-poblar] ERROR:', err)
    process.exitCode = 1
  })
  .finally(async () => {
    await closePgPool()
  })
