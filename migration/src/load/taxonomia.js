import { extractTaxonomia } from '../extract/taxonomia.js';
import { transformTaxonomia } from '../transform/taxonomia.js';
import { buildFirestoreIdMap } from './pg-client.js';
import { reconcileEntity } from '../reconcile/reconcile.js';

const DIMENSIONES = [
  'autonomia', 'insercion_institucional', 'jerarquia_normativa', 'dependencia',
  'asistencia_jurisdiccional', 'alcance_proceso', 'alcance_fuero',
  'presencia_territorial', 'grado_implementacion',
];

// T021 (US2): FR-021/022/023. Solo se materializan organismos con doc v1
// completo (V4.2/V4.4/V4.5 ya lo confirman para el snapshot vigente).
export async function loadTaxonomia(client) {
  const registros = await extractTaxonomia();
  const organismos = await buildFirestoreIdMap(client, 'organismos');

  let insertados = 0;
  const correcciones = [];
  for (const registro of registros) {
    const t = transformTaxonomia(registro);
    const organismoId = organismos.get(t.organismo_firestore_id);
    if (organismoId === undefined) {
      throw new Error(`taxonomia: organismo padre no resuelto (${t.organismo_firestore_id})`);
    }
    const valores = DIMENSIONES.map((d) => t[d]);
    await client.query(
      `INSERT INTO evaluaciones_taxonomicas
         (organismo_id, autonomia, insercion_institucional, jerarquia_normativa, dependencia,
          asistencia_jurisdiccional, alcance_proceso, alcance_fuero, presencia_territorial, grado_implementacion)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [organismoId, ...valores],
    );
    insertados++;
    for (const c of t.correcciones) {
      correcciones.push(`organismo firestore_id=${t.organismo_firestore_id}: ${c.dimension} "${c.original}" -> "${c.usado}" (D-17, forzado, confirmado por el usuario)`);
    }
  }
  if (correcciones.length) {
    console.log(`taxonomia: correcciones de código fuera de catálogo aplicadas: ${correcciones.join(' | ')}`);
  }

  const entrada = await reconcileEntity(client, 'evaluaciones_taxonomicas', registros.length, insertados);
  if (correcciones.length && entrada.resultado === 'coincide') {
    // Deja constancia permanente de la corrección D-17 en el propio log de
    // reconciliación, aunque los conteos coincidan (pedido explícito del usuario).
    await client.query(
      `UPDATE migracion_reconciliacion SET detalle = $1
       WHERE entidad = 'evaluaciones_taxonomicas' AND corrida_a = (
         SELECT max(corrida_a) FROM migracion_reconciliacion WHERE entidad = 'evaluaciones_taxonomicas'
       )`,
      [correcciones.join(' | ')],
    );
  }

  return { evaluaciones_taxonomicas: insertados };
}
