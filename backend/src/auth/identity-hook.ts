// Hook de identidad (Principio V, research.md Decisión 3 — validado por el
// spike T007, GO). Resuelve o crea la fila en public.usuarios por email
// ANTES de que Better Auth cree su propia fila en auth."user", y fuerza el
// id de auth."user" a ser el mismo valor (como string) que usuarios.id.
// Esto evita una segunda tabla de identidad: usuarios sigue siendo la única
// fuente de verdad de "quién es esta persona en el dominio".
//
// Forma de retorno confirmada por el spike (node_modules/better-auth/dist/db/with-hooks.mjs):
// el hook DEBE devolver { data: {...} }, que Better Auth mergea sobre los
// datos originales antes de crear la fila (createWithHooks ya pasa
// forceAllowId: true en ese camino, así que el id fijado acá se respeta).

import type pg from 'pg'

interface DatosAltaUsuario {
  email: string
  [key: string]: unknown
}

export function crearHookIdentidad(pool: pg.Pool) {
  return async (user: DatosAltaUsuario): Promise<{ data: { id: string } }> => {
    const client = await pool.connect()
    try {
      const existente = await client.query<{ id: number }>(
        'SELECT id FROM usuarios WHERE email = $1',
        [user.email],
      )
      if (existente.rows.length > 0) {
        return { data: { id: String(existente.rows[0]!.id) } }
      }
      // firestore_id es NOT NULL UNIQUE (db/schema.sql); los usuarios migrados
      // ya usan el email como firestore_id (= doc-id de origen). Para un alta
      // nueva por esta API (que nunca existió en Firestore) reusamos el mismo
      // valor por consistencia con esa convención, no porque haya un doc real.
      const insertado = await client.query<{ id: number }>(
        `INSERT INTO usuarios (email, firestore_id) VALUES ($1, $2) RETURNING id`,
        [user.email, user.email],
      )
      return { data: { id: String(insertado.rows[0]!.id) } }
    } finally {
      client.release()
    }
  }
}
