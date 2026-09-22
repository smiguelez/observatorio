import { getPgPool } from '../load/pg-client.js';
import { loadUsuarios } from '../load/usuarios.js';
import { loadLocalidades } from '../load/localidades.js';
import { loadGruposJueces } from '../load/grupos-jueces.js';
import { loadOrganismos } from '../load/organismos.js';
import { loadUnidadesFuncionales } from '../load/unidades-funcionales.js';
import { loadAsignacionesJueces } from '../load/asignaciones-jueces.js';
import { loadTaxonomia } from '../load/taxonomia.js';

// T022 (US2): orquesta la migración completa en orden FK-seguro, dentro de
// UNA transacción (todo o nada — Principio X): catálogos ya sembrados (T008)
// -> usuarios -> localidades, grupos_jueces (pools) -> organismos (+
// organismo_editores + organismo_fueros) -> unidades_funcionales ->
// asignaciones de jueces -> evaluaciones_taxonomicas. Cada paso reconcilia su
// propia entidad (FR-031) y hace `halt` (lanza) ante discrepancia (FR-032/034).
export async function runMigration() {
  const pool = getPgPool();
  const client = await pool.connect();
  const resumen = {};
  try {
    await client.query('BEGIN');

    Object.assign(resumen, await loadUsuarios(client));
    Object.assign(resumen, await loadLocalidades(client));
    Object.assign(resumen, await loadGruposJueces(client));
    Object.assign(resumen, await loadOrganismos(client));
    const unidadesFuncionales = await loadUnidadesFuncionales(client);
    resumen.unidades_funcionales = unidadesFuncionales.length;
    Object.assign(resumen, await loadAsignacionesJueces(client, unidadesFuncionales));
    Object.assign(resumen, await loadTaxonomia(client));

    await client.query('COMMIT');
    return { ok: true, resumen };
  } catch (err) {
    await client.query('ROLLBACK');
    return { ok: false, error: err, resumen };
  } finally {
    client.release();
  }
}
