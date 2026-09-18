import { resolverModoAsignacion } from '../transform/asignaciones-jueces.js';
import { reconcileEntity } from '../reconcile/reconcile.js';

// T020 (US2): deriva unidad_funcional_grupo_jueces a partir de las UF ya
// cargadas (recibidas de load/unidades-funcionales.js). asignacion_fueros
// queda vacía en esta migración inicial (data-model.md §6.5).
export async function loadAsignacionesJueces(client, unidadesFuncionales) {
  const { rows: orgRows } = await client.query('SELECT id, provincia_id FROM organismos');
  const provinciaPorOrganismo = new Map(orgRows.map((r) => [r.id, r.provincia_id]));

  const { rows: poolRows } = await client.query(
    'SELECT id, firestore_id, total_jueces FROM grupos_jueces WHERE firestore_id IS NOT NULL',
  );
  const poolsPorFirestoreId = new Map(poolRows.map((r) => [r.firestore_id, r]));

  let asignacionesInsertadas = 0;
  let gruposExclusivosCreados = 0;
  let sinAsignacion = 0;

  for (const uf of unidadesFuncionales) {
    const resuelto = resolverModoAsignacion(uf);

    if (resuelto.modo === 'pool') {
      const pool = poolsPorFirestoreId.get(resuelto.poolFirestoreId);
      if (!pool) {
        throw new Error(`asignaciones: pool_jueces_id "${resuelto.poolFirestoreId}" no resuelve (UF ${uf.firestore_id})`);
      }
      await client.query(
        `INSERT INTO unidad_funcional_grupo_jueces (unidad_funcional_id, grupo_jueces_id, cantidad_asignada)
         VALUES ($1,$2,$3)`,
        [uf.id, pool.id, pool.total_jueces],
      );
      asignacionesInsertadas++;
    } else if (resuelto.modo === 'exclusivo') {
      const provinciaId = provinciaPorOrganismo.get(uf.organismoId);
      const { rows } = await client.query(
        `INSERT INTO grupos_jueces (descripcion, total_jueces, provincia_id, firestore_id)
         VALUES (NULL, $1, $2, NULL) RETURNING id`,
        [resuelto.juecesAsistidos, provinciaId],
      );
      gruposExclusivosCreados++;
      await client.query(
        `INSERT INTO unidad_funcional_grupo_jueces (unidad_funcional_id, grupo_jueces_id, cantidad_asignada)
         VALUES ($1,$2,$3)`,
        [uf.id, rows[0].id, resuelto.juecesAsistidos],
      );
      asignacionesInsertadas++;
    } else {
      sinAsignacion++;
    }
  }

  // Conteo esperado de asignaciones: derivado de las UF ya cargadas (no de una
  // colección de origen propia — quickstart.md Paso 4, nota D8).
  const esperadas = unidadesFuncionales.length - sinAsignacion;
  await reconcileEntity(client, 'unidad_funcional_grupo_jueces', esperadas, asignacionesInsertadas);

  return { asignaciones: asignacionesInsertadas, grupos_exclusivos: gruposExclusivosCreados, sin_asignacion: sinAsignacion };
}
