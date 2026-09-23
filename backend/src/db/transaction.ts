// T005 (004-fix-taxonomia-endpoint, US2): primera transacción explícita
// multi-sentencia de este backend — hasta acá cada ruta hacía una sola
// sentencia INSERT/UPDATE/DELETE, confiando en su atomicidad de a una más
// los triggers de la base. El reemplazo completo de taxonomía (DELETE +
// INSERT por respuesta) y el cambio de tipo de organismo con eliminación
// de respuestas huérfanas (Protección B, US5) sí necesitan que varias
// sentencias se apliquen todas juntas o ninguna — research.md Decisión 3.
import type pg from 'pg'

export async function conTransaccion<T>(pool: pg.Pool, fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const resultado = await fn(client)
    await client.query('COMMIT')
    return resultado
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}
