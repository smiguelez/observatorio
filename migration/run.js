import { runMigration } from './src/reconcile/orchestrator.js';
import { closePgPool } from './src/load/pg-client.js';

const resultado = await runMigration();

if (resultado.ok) {
  console.log('Migración completa. Resumen:', resultado.resumen);
} else {
  console.error('Migración detenida (halt):', resultado.error.message);
  console.error('Progreso previo al error:', resultado.resumen);
}

await closePgPool();
process.exit(resultado.ok ? 0 : 1);
