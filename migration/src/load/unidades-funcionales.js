import { extractUnidadesFuncionales } from '../extract/unidades-funcionales.js';
import { transformUnidadFuncional } from '../transform/unidades-funcionales.js';
import { buildNameIdMap, buildFirestoreIdMap } from './pg-client.js';
import { reconcileEntity } from '../reconcile/reconcile.js';

// T019 (US2): FR-015/016/017. Devuelve también las filas ya transformadas
// (con sus ids subrogados) para que asignaciones-jueces.js (T020) no tenga
// que re-extraer/re-transformar unidades_funcionales.
export async function loadUnidadesFuncionales(client) {
  const registros = await extractUnidadesFuncionales();
  const tiposUf = await buildNameIdMap(client, 'tipos_uf');
  const organismos = await buildFirestoreIdMap(client, 'organismos');
  const localidades = await buildFirestoreIdMap(client, 'localidades');

  let insertados = 0;
  const cargadas = [];
  for (const registro of registros) {
    const uf = transformUnidadFuncional(registro);
    const organismoId = organismos.get(uf.organismo_firestore_id);
    const localidadId = localidades.get(uf.localidad_firestore_id);
    const tipoUfId = tiposUf.get(uf.tipo_uf_nombre);
    if (organismoId === undefined) {
      throw new Error(`unidades_funcionales: organismo padre no resuelto (${uf.firestore_id})`);
    }
    if (localidadId === undefined) {
      throw new Error(`unidades_funcionales: localidad_id "${uf.localidad_firestore_id}" no resuelve (${uf.firestore_id})`);
    }
    if (tipoUfId === undefined) {
      throw new Error(`unidades_funcionales: tipo_uf desconocido "${uf.tipo_uf_nombre}" (${uf.firestore_id})`);
    }

    const { rows } = await client.query(
      `INSERT INTO unidades_funcionales
         (organismo_id, denominacion_unidad, localidad_id, tipo_uf_id, anio_implementacion,
          domicilio, telefono, mail, responsable, codigo_postal, firestore_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING id`,
      [organismoId, uf.denominacion_unidad, localidadId, tipoUfId, uf.anio_implementacion,
        uf.domicilio, uf.telefono, uf.mail, uf.responsable, uf.codigo_postal, uf.firestore_id],
    );
    insertados++;
    cargadas.push({ id: rows[0].id, organismoId, ...uf });
  }

  await reconcileEntity(client, 'unidades_funcionales', registros.length, insertados);

  return cargadas;
}
