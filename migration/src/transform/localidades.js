// D-15 (decisión ad-hoc de esta corrida, confirmada por el usuario): la
// localidad "Ciudad Autónoma de Buenos Aires" (doc AhG90OkqogQ93egSR7I1) no
// trae latitud/longitud en el origen (dato agregado después de la verificación
// del 2026-09-07, que no encontró ningún caso así). El esquema exige NOT NULL
// (V5.4). Se completa con la coordenada real y pública del centro de CABA
// (Obelisco, -34.6037/-58.3816), no un valor arbitrario; se deja constancia
// acá porque no viene del dato de origen (Principio XII).
const COORDENADAS_COMPLETADAS = {
  AhG90OkqogQ93egSR7I1: { latitud: -34.6037, longitud: -58.3816 },
};

export function transformLocalidad({ firestoreId, data }) {
  const completada = COORDENADAS_COMPLETADAS[firestoreId];
  const latitud = data.latitud ?? completada?.latitud ?? null;
  const longitud = data.longitud ?? completada?.longitud ?? null;
  if (latitud === null || longitud === null) {
    throw new Error(`localidades: falta latitud/longitud para ${firestoreId} y no hay corrección documentada`);
  }
  return {
    firestore_id: firestoreId,
    nombre: data.nombre,
    provincia_nombre: data.provincia,
    latitud,
    longitud,
    completada: Boolean(completada),
  };
}
