// Script principal — recorre REPORTES (config.ts) y sincroniza cada vista a su pestaña. Una vista
// que falla (leer o escribir) NO frena a las demás: se registra el motivo y se sigue con la
// próxima; al final se reporta cuántas salieron bien y el detalle de las que fallaron (mismo
// criterio de "una falla no tira todo el proceso" que ya usa el resto del proyecto — p. ej. el
// detector de anomalías del runbook de corte). Sale con código de error si falló al menos una, para
// que un cron futuro pueda notarlo sin tener que leer el log.
//
// Conexión de SOLO LECTURA con el rol `metabase_ro` (la misma que ya usa Metabase) — este script
// nunca escribe en Postgres, solo lee las vistas ya creadas.
import pg from 'pg'
import { loadReportingSheetsConfig } from '../../src/config/env.js'
import { leerVista } from './postgres.js'
import { asegurarHoja, obtenerTokenSheets, sobrescribirHoja } from './sheets.js'
import { REPORTES } from './config.js'

interface Resultado {
  hoja: string
  vista: string
  ok: boolean
  motivo?: string
  filas?: number
}

async function main() {
  const cfg = loadReportingSheetsConfig()
  const pool = new pg.Pool({ connectionString: cfg.metabaseRoUrl })
  const token = await obtenerTokenSheets(cfg.keyFile)

  const resultados: Resultado[] = []

  for (const { vista, hoja } of REPORTES) {
    try {
      const datos = await leerVista(pool, vista)
      await asegurarHoja(token, cfg.spreadsheetId, hoja)
      await sobrescribirHoja(token, cfg.spreadsheetId, hoja, datos)
      resultados.push({ hoja, vista, ok: true, filas: datos.filas.length })
      console.log(`[reportes-sheets] OK   "${hoja}" <- ${vista} (${datos.filas.length} fila(s))`)
    } catch (err) {
      const motivo = err instanceof Error ? err.message : String(err)
      resultados.push({ hoja, vista, ok: false, motivo })
      console.error(`[reportes-sheets] FALLÓ "${hoja}" <- ${vista}: ${motivo}`)
    }
  }

  await pool.end()

  const fallidos = resultados.filter((r) => !r.ok)
  console.log(`\n[reportes-sheets] ${resultados.length - fallidos.length}/${resultados.length} pestañas sincronizadas.`)
  if (fallidos.length > 0) {
    console.log('[reportes-sheets] Fallaron:')
    for (const f of fallidos) console.log(`  - "${f.hoja}" (${f.vista}): ${f.motivo}`)
    process.exitCode = 1
  }
}

main().catch((err) => {
  console.error('[reportes-sheets] ERROR inesperado (no por-vista — p. ej. no se pudo autenticar contra Google, o la conexión de Postgres falló por completo):', err)
  process.exitCode = 1
})
