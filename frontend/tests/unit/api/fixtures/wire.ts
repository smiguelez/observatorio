// Respuestas REALES del backend, capturadas el 2026-09-24 contra la base local
// (usuario test-frontend-shape); los datos de personas y de pools reales se reemplazaron por valores
// sintéticos conservando la FORMA (tipos de cada campo). Base de los tests de mapeo (D13). Si el backend
// cambia la forma, el test del recurso falla y este archivo se recaptura.
export const wire = {
  organismosLista: [{ id: '742', denominacion: 'test-frontend-org', propietario_id: '1186' }],
  organismoDetalle: {
    id: '742',
    denominacion: 'test-frontend-org',
    denominacion_simplificada_id: 1,
    tipo_oficina_id: 1,
    provincia_id: 1,
    propietario_id: '1186',
    estado_fueros: 'sin_fueros_asignados',
    legacy_id: null,
    actualizado_a: '2026-09-24T20:05:33.573Z',
    firestore_id: 'api:48e66a3a-d941-4e8b-b336-1299f1aaef55',
  },
  fueroVacio: { fueros: [], fueroSimplificado: null },
  poolCreado: { id: '729', descripcion: 'test-frontend-pool', total_jueces: 5, provincia_id: 1 },
  poolsLista: [
    { id: '312', descripcion: 'Pool de ejemplo 1', total_jueces: 3, provincia_id: 1 },
    { id: '315', descripcion: 'Pool de ejemplo 2', total_jueces: 36, provincia_id: 1 },
  ],
  usuariosLista: [
    { id: '97', email: 'usuario-0@ejemplo.test', nombre_display: 'Usuario 0', provincia_id: 10, roles: ['usuario_normal'] },
  ],
} as const
