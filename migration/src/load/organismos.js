import { extractOrganismos } from '../extract/organismos.js';
import { transformOrganismo } from '../transform/organismos.js';
import { buildNameIdMap } from './pg-client.js';
import { reconcileEntity } from '../reconcile/reconcile.js';

async function buildEmailIdMap(client) {
  const { rows } = await client.query('SELECT id, lower(email::text) AS email FROM usuarios');
  return new Map(rows.map((row) => [row.email, row.id]));
}

// T018 (US2) + T029 (organismo_editores, US4) + T031 (organismo_fueros, US5):
// se cargan juntos porque comparten el mismo registro de origen (organismos)
// y estado_fueros/organismo_fueros se derivan del mismo campo fuero_simplificado.
export async function loadOrganismos(client) {
  const registros = await extractOrganismos();
  const denominaciones = await buildNameIdMap(client, 'denominaciones_simplificadas');
  const tiposOficina = await buildNameIdMap(client, 'tipos_oficina');
  const provincias = await buildNameIdMap(client, 'provincias');
  const fueros = await buildNameIdMap(client, 'fueros');
  const usuariosPorEmail = await buildEmailIdMap(client);

  let insertados = 0;
  let editoresInsertados = 0;
  let fuerosInsertados = 0;

  for (const registro of registros) {
    const o = transformOrganismo(registro);

    const denominacionId = denominaciones.get(o.denominacion_simplificada_nombre);
    const tipoOficinaId = tiposOficina.get(o.tipo_oficina_nombre);
    const provinciaId = provincias.get(o.provincia_nombre);
    const propietarioId = usuariosPorEmail.get(o.propietario_email);
    if (denominacionId === undefined) {
      throw new Error(`organismos: denominacion_simplificada desconocida "${o.denominacion_simplificada_nombre}" (${o.firestore_id})`);
    }
    if (tipoOficinaId === undefined) {
      throw new Error(`organismos: tipo_oficina desconocido "${o.tipo_oficina_nombre}" (${o.firestore_id})`);
    }
    if (provinciaId === undefined) {
      throw new Error(`organismos: provincia desconocida "${o.provincia_nombre}" (${o.firestore_id})`);
    }
    if (propietarioId === undefined) {
      throw new Error(`organismos: usuario_google "${o.propietario_email}" no resuelve a un usuario (${o.firestore_id})`);
    }

    const { rows } = await client.query(
      `INSERT INTO organismos
         (denominacion, denominacion_simplificada_id, tipo_oficina_id, provincia_id,
          propietario_id, estado_fueros, legacy_id, actualizado_a, firestore_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id`,
      [o.denominacion, denominacionId, tipoOficinaId, provinciaId, propietarioId,
        o.estado_fueros, o.legacy_id, o.actualizado_a, o.firestore_id],
    );
    insertados++;
    const organismoId = rows[0].id;

    for (const email of o.editores) {
      const editorId = usuariosPorEmail.get(email);
      if (editorId === undefined) {
        throw new Error(`organismo_editores: editor "${email}" no resuelve a un usuario (${o.firestore_id})`);
      }
      await client.query(
        'INSERT INTO organismo_editores (organismo_id, usuario_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
        [organismoId, editorId],
      );
      editoresInsertados++;
    }

    // T031: fuero concreto conocido -> 1 fila en organismo_fueros. Un
    // organismo 'multifuero_sin_detalle' no tiene filas (fueros desconocidos).
    if (o.estado_fueros === 'cargado') {
      const fueroId = fueros.get(o.fuero_simplificado);
      if (fueroId === undefined) {
        throw new Error(`organismo_fueros: fuero desconocido "${o.fuero_simplificado}" (${o.firestore_id})`);
      }
      await client.query(
        'INSERT INTO organismo_fueros (organismo_id, fuero_id) VALUES ($1,$2)',
        [organismoId, fueroId],
      );
      fuerosInsertados++;
    }
  }

  await reconcileEntity(client, 'organismos', registros.length, insertados);

  const editoresEsperados = registros.reduce(
    (acc, r) => acc + (Array.isArray(r.data.editores) ? r.data.editores.length : 0), 0,
  );
  await reconcileEntity(client, 'organismo_editores', editoresEsperados, editoresInsertados);

  const fuerosEsperados = registros.filter((r) => r.data.fuero_simplificado && r.data.fuero_simplificado !== 'multifuero').length;
  await reconcileEntity(client, 'organismo_fueros', fuerosEsperados, fuerosInsertados);

  return { organismos: insertados, organismo_editores: editoresInsertados, organismo_fueros: fuerosInsertados };
}
