import { extractLocalidades } from '../extract/localidades.js';
import { transformLocalidad } from '../transform/localidades.js';
import { buildNameIdMap } from './pg-client.js';
import { reconcileEntity } from '../reconcile/reconcile.js';

// T016 (US2): FR-019.
export async function loadLocalidades(client) {
  const registros = await extractLocalidades();
  const provincias = await buildNameIdMap(client, 'provincias');

  let insertados = 0;
  const completadas = [];
  for (const registro of registros) {
    const l = transformLocalidad(registro);
    const provinciaId = provincias.get(l.provincia_nombre);
    if (provinciaId === undefined) {
      throw new Error(`localidades: provincia desconocida "${l.provincia_nombre}" (${l.firestore_id})`);
    }
    await client.query(
      `INSERT INTO localidades (nombre, provincia_id, latitud, longitud, firestore_id)
       VALUES ($1,$2,$3,$4,$5)`,
      [l.nombre, provinciaId, l.latitud, l.longitud, l.firestore_id],
    );
    insertados++;
    if (l.completada) completadas.push(l.firestore_id);
  }
  if (completadas.length) {
    console.log(`localidades: coordenadas completadas en migración (D-15, no venían en origen): ${completadas.join(', ')}`);
  }

  await reconcileEntity(client, 'localidades', registros.length, insertados);

  return { localidades: insertados };
}
