// Lee una vista de Postgres completa, en el orden de columnas de la propia vista (no alfabético:
// `result.fields`, no `Object.keys`), lista para volcar a una hoja de cálculo.
import type pg from 'pg'

export interface VistaLeida {
  headers: string[]
  filas: unknown[][]
}

// Los nombres de vista SIEMPRE vienen de `config.ts` (un array fijo en este mismo repo), nunca de
// una entrada externa — no hay ningún camino por el que un usuario final llegue a este valor. La
// validación es defensa en profundidad, no protección contra un input real no controlado.
const NOMBRE_VISTA_VALIDO = /^[a-z_][a-z0-9_]*$/

export async function leerVista(pool: pg.Pool, vista: string): Promise<VistaLeida> {
  if (!NOMBRE_VISTA_VALIDO.test(vista)) {
    throw new Error(`Nombre de vista inválido: "${vista}" (revisar scripts/reportes-sheets/config.ts)`)
  }

  const resultado = await pool.query(`SELECT * FROM ${vista}`)
  const headers = resultado.fields.map((f) => f.name)
  const filas = resultado.rows.map((fila: Record<string, unknown>) =>
    headers.map((h) => {
      const v = fila[h]
      // Sheets no distingue "vacío" de "ausente": una celda en blanco explícita es más clara que
      // mandar `null` (que la API de Sheets podría interpretar como "no tocar esta celda").
      return v === null || v === undefined ? '' : v
    }),
  )
  return { headers, filas }
}
