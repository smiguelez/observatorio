// T010 (006-backend-endpoints-faltantes, US5): catálogo completo de
// preguntas de taxonomía, filtrable por tipo de organismo — distinto del
// endpoint de RESPUESTAS de 004 (GET /api/organismos/:orgId/taxonomia),
// que solo devuelve lo ya respondido. Lectura para cualquier autenticado
// (FR-014) — es configuración, no dato de un organismo puntual.
import type { FastifyInstance } from 'fastify'
import { getPgPool } from '../db/pool.js'

interface PreguntaRow {
  codigo: string
  texto: string
  grupo: string
  tipo_respuesta: 'opcion_unica' | 'opcion_multiple' | 'numerica' | 'texto_libre'
  opciones: { codigo: string; etiqueta: string }[] | null
}

function formatearPregunta(r: PreguntaRow) {
  const pregunta = { codigo: r.codigo, texto: r.texto, grupo: r.grupo, tipoRespuesta: r.tipo_respuesta }
  if (r.tipo_respuesta === 'opcion_unica' || r.tipo_respuesta === 'opcion_multiple') {
    return { ...pregunta, opciones: r.opciones ?? [] }
  }
  return pregunta
}

export async function registrarRutasTaxonomia(app: FastifyInstance) {
  const pool = getPgPool()

  app.get('/api/taxonomia/preguntas', async (request, reply) => {
    const { tipoOficinaId } = request.query as { tipoOficinaId?: string }

    if (tipoOficinaId !== undefined) {
      const id = Number(tipoOficinaId)
      // tipos_oficina.id es smallint (-32768..32767) — un valor fuera de
      // rango (o no numérico) haría explotar la consulta con un error de
      // Postgres (22003) antes de llegar siquiera a "no existe": se trata
      // como el mismo caso de tipo inexistente (FR-017), no como un 500.
      const esIdValido = Number.isInteger(id) && id >= -32768 && id <= 32767
      const tipoExiste = esIdValido
        ? (await pool.query('SELECT 1 FROM tipos_oficina WHERE id = $1', [id])).rows
        : []
      if (tipoExiste.length === 0) {
        return reply.code(400).send({ error: `tipoOficinaId ${tipoOficinaId} no corresponde a ningún tipo de organismo real` })
      }

      const { rows } = await pool.query<PreguntaRow>(
        `SELECT p.codigo, p.texto, p.grupo, p.tipo_respuesta,
                json_agg(json_build_object('codigo', o.codigo, 'etiqueta', o.etiqueta) ORDER BY o.orden)
                  FILTER (WHERE o.id IS NOT NULL) AS opciones
           FROM taxonomia_preguntas p
           JOIN taxonomia_pregunta_tipos_oficina tpto ON tpto.pregunta_id = p.id AND tpto.tipo_oficina_id = $1
           LEFT JOIN taxonomia_opciones o ON o.pregunta_id = p.id
          GROUP BY p.id, p.codigo, p.texto, p.grupo, p.tipo_respuesta
          ORDER BY p.orden`,
        [id],
      )
      return rows.map(formatearPregunta)
    }

    const { rows } = await pool.query<PreguntaRow>(
      `SELECT p.codigo, p.texto, p.grupo, p.tipo_respuesta,
              json_agg(json_build_object('codigo', o.codigo, 'etiqueta', o.etiqueta) ORDER BY o.orden)
                FILTER (WHERE o.id IS NOT NULL) AS opciones
         FROM taxonomia_preguntas p
         LEFT JOIN taxonomia_opciones o ON o.pregunta_id = p.id
        GROUP BY p.id, p.codigo, p.texto, p.grupo, p.tipo_respuesta
        ORDER BY p.orden`,
    )
    return rows.map(formatearPregunta)
  })
}
