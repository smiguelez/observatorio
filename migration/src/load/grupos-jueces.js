import { extractPoolsJueces } from '../extract/grupos-jueces.js';
import { buildNameIdMap } from './pg-client.js';
import { reconcileEntity } from '../reconcile/reconcile.js';

// T017 (US2): cada pools_jueces -> un grupos_jueces con total_jueces =
// cantidad_jueces y firestore_id seteado (D8/FR-020). Los grupos exclusivos
// derivados de UF con cantidad directa se cargan en asignaciones-jueces.js.
export async function loadGruposJueces(client) {
  const registros = await extractPoolsJueces();
  const provincias = await buildNameIdMap(client, 'provincias');

  let insertados = 0;
  for (const { firestoreId, data } of registros) {
    const provinciaId = provincias.get(data.provincia);
    if (provinciaId === undefined) {
      throw new Error(`grupos_jueces: provincia desconocida "${data.provincia}" (${firestoreId})`);
    }
    await client.query(
      `INSERT INTO grupos_jueces (descripcion, total_jueces, provincia_id, firestore_id)
       VALUES ($1,$2,$3,$4)`,
      [data.descripcion ?? null, Number(data.cantidad_jueces), provinciaId, firestoreId],
    );
    insertados++;
  }

  // Reconcilia solo el subconjunto de pools de origen (firestore_id IS NOT
  // NULL): los grupos exclusivos derivados no vienen de esta colección
  // (quickstart.md Paso 4, nota D8).
  const { rows } = await client.query(
    'SELECT count(*)::int AS n FROM grupos_jueces WHERE firestore_id IS NOT NULL',
  );
  await reconcileEntity(client, 'grupos_jueces', registros.length, rows[0].n);

  return { grupos_jueces_pools: insertados };
}
