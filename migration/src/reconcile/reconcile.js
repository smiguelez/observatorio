// Motor de reconciliación (Principio X, FR-030/031/032/034). Compara el conteo
// de origen (Firestore) contra el conteo de destino (PostgreSQL) por entidad,
// persiste el resultado en migracion_reconciliacion y detiene el pipeline
// (`halt`) ante una discrepancia sin resolver — "corrió sin error" no es
// evidencia de completitud (data-model.md §9).

export class DiscrepanciaAbiertaError extends Error {
  constructor(entidad, conteoOrigen, conteoDestino) {
    super(
      `Reconciliación abierta para "${entidad}": origen=${conteoOrigen} destino=${conteoDestino}. ` +
        'La migración se detiene (FR-032).',
    );
    this.name = 'DiscrepanciaAbiertaError';
    this.entidad = entidad;
    this.conteoOrigen = conteoOrigen;
    this.conteoDestino = conteoDestino;
  }
}

// Conforma contracts/reconciliacion-log.schema.json.
export function buildEntrada(entidad, conteoOrigen, conteoDestino, detalle = null) {
  const resultado = conteoOrigen === conteoDestino ? 'coincide' : 'discrepancia_abierta';
  if (resultado !== 'coincide' && !detalle) {
    detalle = `Conteo de origen (${conteoOrigen}) y destino (${conteoDestino}) no coinciden.`;
  }
  return { entidad, conteo_origen: conteoOrigen, conteo_destino: conteoDestino, resultado, detalle };
}

// Persiste una entrada en migracion_reconciliacion y, si quedó en
// discrepancia_abierta, detiene el pipeline lanzando DiscrepanciaAbiertaError
// (FR-034: halt en discrepancia).
export async function reconcileEntity(client, entidad, conteoOrigen, conteoDestino) {
  const entrada = buildEntrada(entidad, conteoOrigen, conteoDestino);
  await client.query(
    `INSERT INTO migracion_reconciliacion (entidad, conteo_origen, conteo_destino, resultado, detalle)
     VALUES ($1, $2, $3, $4, $5)`,
    [entrada.entidad, entrada.conteo_origen, entrada.conteo_destino, entrada.resultado, entrada.detalle],
  );
  if (entrada.resultado === 'discrepancia_abierta') {
    throw new DiscrepanciaAbiertaError(entidad, conteoOrigen, conteoDestino);
  }
  return entrada;
}

// Arma el log completo (contracts/reconciliacion-log.schema.json) a partir de
// las entradas ya reconciliadas, para emitirlo como artefacto de la corrida.
export function buildReconciliationLog(entradas, origen = 'firestore:observatorio') {
  return { corrida_a: new Date().toISOString(), origen, entradas };
}
