// GET /api/organismos/completitud — completitud de TODOS los organismos visibles para quien consulta, en UNA sola consulta SQL
// agregada (sin N+1). Antes la pantalla de gestión de organismos la calculaba en el cliente con ~3 solicitudes por organismo
// (detalle, unidades funcionales, respuestas de taxonomía) más el catálogo por tipo (~341 llamadas para 118 organismos).
//
// NO cambia la regla de negocio: es exactamente la que calculaba el cliente (frontend/src/features/completitud/calcular.ts, US7 de
// 005), solo que ahora se calcula acá:
//   - datosBasicos: denominación con algún carácter que no sea espacio, y denominación simplificada, tipo de oficina y provincia presentes;
//   - unidades:     al menos una unidad funcional;
//   - taxonomia:    al menos una respuesta cargada, O el tipo de oficina no tiene ninguna pregunta aplicable (`catalogoVacio`);
//   - completo:     las tres a la vez.
//
// Visibilidad = la de `GET /api/organismos`: un admin ve todos; el resto solo los que es propietario o editor (nunca se expone
// el estado de un organismo ajeno). La pantalla que la consume es de admin, pero la autorización real es esta (Principio II).
import type { FastifyInstance } from 'fastify'
import { getPgPool } from '../db/pool.js'

export async function registrarRutasCompletitud(app: FastifyInstance) {
  const pool = getPgPool()

  app.get('/api/organismos/completitud', async (request) => {
    const identidad = request.identidad!
    const { rows } = await pool.query(
      `SELECT o.id::text AS "organismoId",
              o.denominacion,
              o.tipo_oficina_id AS "tipoOficinaId",
              o.provincia_id AS "provinciaId",
              c.datos AS "datosBasicos",
              c.uf AS "unidades",
              c.vacio AS "catalogoVacio",
              (c.vacio OR c.resp) AS "taxonomia",
              (c.datos AND c.uf AND (c.vacio OR c.resp)) AS "completo"
         FROM organismos o
        CROSS JOIN LATERAL (
              SELECT (o.denominacion ~ '\\S' AND o.denominacion_simplificada_id > 0 AND o.tipo_oficina_id > 0 AND o.provincia_id > 0) AS datos,
                     EXISTS (SELECT 1 FROM unidades_funcionales uf WHERE uf.organismo_id = o.id) AS uf,
                     NOT EXISTS (SELECT 1 FROM taxonomia_pregunta_tipos_oficina t WHERE t.tipo_oficina_id = o.tipo_oficina_id) AS vacio,
                     EXISTS (SELECT 1 FROM evaluaciones_taxonomicas e WHERE e.organismo_id = o.id) AS resp
             ) c
        WHERE $1::boolean
           OR o.propietario_id = $2::bigint
           OR EXISTS (SELECT 1 FROM organismo_editores oe WHERE oe.organismo_id = o.id AND oe.usuario_id = $2::bigint)
        ORDER BY o.id`,
      [identidad.rol === 'admin', identidad.usuarioId.toString()],
    )
    return rows
  })
}
