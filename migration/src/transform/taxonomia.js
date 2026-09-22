// Aplana taxonomia/v1 (agrupado en gestion/institucional/organizacion/
// implementacion) a las 9 columnas planas de evaluaciones_taxonomicas
// (data-model.md §7). V4.3/V4.6/V4.7: si aparece una forma divergente
// (doble-anidado, no-string, código fuera de catálogo) se detiene con un
// error explícito en vez de adivinar una canonicalización no especificada.

const CODIGOS_VALIDOS = {
  autonomia: ['A', 'B', 'C', 'D'],
  insercion_institucional: ['A', 'B', 'C'],
  jerarquia_normativa: ['A', 'B', 'C', 'D'],
  dependencia: ['A', 'B', 'C', 'D'],
  asistencia_jurisdiccional: ['A', 'B', 'C'],
  alcance_proceso: ['A', 'B', 'C', 'D'],
  alcance_fuero: ['A', 'B', 'C', 'E'],
  presencia_territorial: ['A', 'B', 'C', 'D'],
  grado_implementacion: ['A', 'B'],
};

const GRUPO_POR_DIMENSION = {
  autonomia: 'gestion',
  insercion_institucional: 'institucional',
  jerarquia_normativa: 'institucional',
  dependencia: 'organizacion',
  asistencia_jurisdiccional: 'organizacion',
  alcance_proceso: 'implementacion',
  alcance_fuero: 'implementacion',
  presencia_territorial: 'implementacion',
  grado_implementacion: 'implementacion',
};

// D-17 (decisión ad-hoc de esta corrida, confirmada por el usuario): el
// organismo fFzdS7Cfy0I1hYvAFSBW trae presencia_territorial="F", fuera del
// catálogo A-D (src/constants/taxonomiaOptions.js). Sin forma de inferir la
// opción real, el usuario indicó forzar "A" y dejar constancia en el log de
// reconciliación (organismo + código original + valor elegido).
const CORRECCIONES_CODIGO = {
  fFzdS7Cfy0I1hYvAFSBW: { presencia_territorial: { original: 'F', usar: 'A' } },
};

export function transformTaxonomia({ parentId, data }) {
  const resultado = { organismo_firestore_id: parentId, correcciones: [] };
  for (const [dimension, grupo] of Object.entries(GRUPO_POR_DIMENSION)) {
    let valor = data?.[grupo]?.[dimension];
    if (typeof valor !== 'string' || valor.trim() === '') {
      throw new Error(`taxonomia: valor no-string o vacío en ${grupo}.${dimension} (organismo ${parentId}, forma divergente no canonicalizada)`);
    }
    if (!CODIGOS_VALIDOS[dimension].includes(valor)) {
      const correccion = CORRECCIONES_CODIGO[parentId]?.[dimension];
      if (!correccion || correccion.original !== valor) {
        throw new Error(`taxonomia: código "${valor}" fuera de catálogo en ${dimension} (organismo ${parentId})`);
      }
      resultado.correcciones.push({ dimension, original: correccion.original, usado: correccion.usar });
      valor = correccion.usar;
    }
    resultado[dimension] = valor;
  }
  return resultado;
}
