import { extractAnioImplementacion, emptyToNull } from './canonicalize.js';

// FR-015/016 (D7/D-08): anio_implementacion se extrae por regla D7; los
// "vacíos legítimos" (domicilio, telefono, mail, responsable, codigo_postal)
// migran como NULL, no como error (data-model.md §4).
export function transformUnidadFuncional({ firestoreId, parentId, data }) {
  return {
    firestore_id: firestoreId,
    organismo_firestore_id: parentId,
    denominacion_unidad: data.denominacion_unidad,
    localidad_firestore_id: data.localidad_id,
    tipo_uf_nombre: data.tipo_uf,
    anio_implementacion: extractAnioImplementacion(data.anio_implementacion),
    domicilio: emptyToNull(data.domicilio),
    telefono: emptyToNull(data.telefono),
    mail: emptyToNull(data.mail),
    responsable: emptyToNull(data.responsable),
    codigo_postal: emptyToNull(data.codigo_postal),
    pool_jueces_firestore_id: data.pool_jueces_id ?? null,
    jueces_asistidos: data.jueces_asistidos,
  };
}
