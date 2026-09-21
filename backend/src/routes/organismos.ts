// T022 (US2): CRUD de organismos (FR-012, FR-013). T024: subrutas de UF y
// taxonomía, autorizadas SIEMPRE contra el organismo padre (FR-014) — nunca
// una regla propia.
//
// FR-013 / Principio II en código: el body de POST/PATCH nunca se vuelca
// entero al INSERT/UPDATE. Cada columna se lee explícitamente del body
// tipado (`body.denominacion`, etc.); `propietario_id` NUNCA se lee del
// body — se fuerza siempre a `identidad.usuarioId` de la sesión. Aunque el
// cliente mande `propietarioId` en el JSON, no existe ninguna línea de
// código que lo copie a la query — no es una validación que lo rechace, es
// que la ruta de datos para ese campo simplemente no existe desde el body.
import type { FastifyInstance } from 'fastify'
import { randomUUID } from 'node:crypto'
import { Type, type Static } from '@sinclair/typebox'
import { getPgPool } from '../db/pool.js'
import { buscarOrganismoParaAutorizar, puedeGestionarOrganismo } from '../authz/organismos.js'

const CrearOrganismoBody = Type.Object({
  denominacion: Type.String({ minLength: 1 }),
  denominacionSimplificadaId: Type.Integer(),
  tipoOficinaId: Type.Integer(),
  provinciaId: Type.Integer(),
})
type CrearOrganismoBody = Static<typeof CrearOrganismoBody>

const ActualizarOrganismoBody = Type.Partial(CrearOrganismoBody)
type ActualizarOrganismoBody = Static<typeof ActualizarOrganismoBody>

const CrearUFBody = Type.Object({
  denominacionUnidad: Type.String({ minLength: 1 }),
  localidadId: Type.Integer(),
  tipoUfId: Type.Integer(),
  anioImplementacion: Type.Optional(Type.Integer()),
  domicilio: Type.Optional(Type.String()),
  telefono: Type.Optional(Type.String()),
  mail: Type.Optional(Type.String()),
  responsable: Type.Optional(Type.String()),
  codigoPostal: Type.Optional(Type.String()),
})
type CrearUFBody = Static<typeof CrearUFBody>

const ActualizarUFBody = Type.Partial(CrearUFBody)

const CodigoTaxonomia = (valores: string[]) => Type.Union(valores.map((v) => Type.Literal(v)))
const TaxonomiaBody = Type.Object({
  autonomia: CodigoTaxonomia(['A', 'B', 'C', 'D']),
  insercionInstitucional: CodigoTaxonomia(['A', 'B', 'C']),
  jerarquiaNormativa: CodigoTaxonomia(['A', 'B', 'C', 'D']),
  dependencia: CodigoTaxonomia(['A', 'B', 'C', 'D']),
  asistenciaJurisdiccional: CodigoTaxonomia(['A', 'B', 'C']),
  alcanceProceso: CodigoTaxonomia(['A', 'B', 'C', 'D']),
  alcanceFuero: CodigoTaxonomia(['A', 'B', 'C', 'E']),
  presenciaTerritorial: CodigoTaxonomia(['A', 'B', 'C', 'D']),
  gradoImplementacion: CodigoTaxonomia(['A', 'B']),
})
type TaxonomiaBody = Static<typeof TaxonomiaBody>

function idParam(request: { params: unknown }, campo = 'id'): number {
  return Number((request.params as Record<string, string>)[campo])
}

export async function registrarRutasOrganismos(app: FastifyInstance) {
  const pool = getPgPool()

  // --- Organismos (FR-012, FR-013) ---

  app.get('/api/organismos', async (request) => {
    const identidad = request.identidad!
    if (identidad.rol === 'admin') {
      const { rows } = await pool.query('SELECT id, denominacion, propietario_id FROM organismos ORDER BY id')
      return rows
    }
    const { rows } = await pool.query(
      `SELECT DISTINCT o.id, o.denominacion, o.propietario_id
         FROM organismos o
         LEFT JOIN organismo_editores oe ON oe.organismo_id = o.id
        WHERE o.propietario_id = $1 OR oe.usuario_id = $1
        ORDER BY o.id`,
      [identidad.usuarioId],
    )
    return rows
  })

  app.post<{ Body: CrearOrganismoBody }>(
    '/api/organismos',
    { schema: { body: CrearOrganismoBody } },
    async (request, reply) => {
      const identidad = request.identidad!
      const { denominacion, denominacionSimplificadaId, tipoOficinaId, provinciaId } = request.body
      const firestoreIdSintetico = `api:${randomUUID()}`

      const { rows } = await pool.query(
        `INSERT INTO organismos
           (denominacion, denominacion_simplificada_id, tipo_oficina_id, provincia_id,
            propietario_id, estado_fueros, actualizado_a, firestore_id)
         VALUES ($1, $2, $3, $4, $5, 'sin_fueros_asignados', now(), $6)
         RETURNING id, denominacion, propietario_id`,
        [denominacion, denominacionSimplificadaId, tipoOficinaId, provinciaId, identidad.usuarioId, firestoreIdSintetico],
      )
      reply.code(201)
      return rows[0]
    },
  )

  app.get('/api/organismos/:id', async (request, reply) => {
    const id = idParam(request)
    const organismo = await buscarOrganismoParaAutorizar(pool, id)
    if (!organismo) return reply.code(404).send({ error: 'No encontrado' })
    if (!puedeGestionarOrganismo(request.identidad!, organismo)) {
      return reply.code(403).send({ error: 'No autorizado' })
    }
    const { rows } = await pool.query('SELECT * FROM organismos WHERE id = $1', [id])
    return rows[0]
  })

  app.patch<{ Body: ActualizarOrganismoBody }>(
    '/api/organismos/:id',
    { schema: { body: ActualizarOrganismoBody } },
    async (request, reply) => {
      const id = idParam(request)
      const organismo = await buscarOrganismoParaAutorizar(pool, id)
      if (!organismo) return reply.code(404).send({ error: 'No encontrado' })
      if (!puedeGestionarOrganismo(request.identidad!, organismo)) {
        return reply.code(403).send({ error: 'No autorizado' })
      }

      const { denominacion, denominacionSimplificadaId, tipoOficinaId, provinciaId } = request.body
      const { rows } = await pool.query(
        `UPDATE organismos SET
           denominacion = COALESCE($2, denominacion),
           denominacion_simplificada_id = COALESCE($3, denominacion_simplificada_id),
           tipo_oficina_id = COALESCE($4, tipo_oficina_id),
           provincia_id = COALESCE($5, provincia_id),
           actualizado_a = now()
         WHERE id = $1
         RETURNING id, denominacion, propietario_id`,
        [id, denominacion ?? null, denominacionSimplificadaId ?? null, tipoOficinaId ?? null, provinciaId ?? null],
      )
      return rows[0]
    },
  )

  app.delete('/api/organismos/:id', async (request, reply) => {
    const id = idParam(request)
    const organismo = await buscarOrganismoParaAutorizar(pool, id)
    if (!organismo) return reply.code(404).send({ error: 'No encontrado' })
    if (!puedeGestionarOrganismo(request.identidad!, organismo)) {
      return reply.code(403).send({ error: 'No autorizado' })
    }
    await pool.query('DELETE FROM organismos WHERE id = $1', [id])
    reply.code(204)
  })

  // --- Unidades funcionales (FR-014: autorización = la del organismo padre) ---

  async function autorizarContraOrganismoPadre(request: { params: unknown; identidad?: unknown }, reply: { code: (n: number) => { send: (b: unknown) => void } }) {
    const orgId = idParam(request, 'orgId')
    const organismo = await buscarOrganismoParaAutorizar(pool, orgId)
    if (!organismo) {
      reply.code(404).send({ error: 'Organismo no encontrado' })
      return null
    }
    if (!puedeGestionarOrganismo(request.identidad as never, organismo)) {
      reply.code(403).send({ error: 'No autorizado' })
      return null
    }
    return orgId
  }

  app.get('/api/organismos/:orgId/unidades-funcionales', async (request, reply) => {
    const orgId = await autorizarContraOrganismoPadre(request, reply)
    if (orgId === null) return
    const { rows } = await pool.query('SELECT * FROM unidades_funcionales WHERE organismo_id = $1 ORDER BY id', [
      orgId,
    ])
    return rows
  })

  app.post<{ Body: CrearUFBody }>(
    '/api/organismos/:orgId/unidades-funcionales',
    { schema: { body: CrearUFBody } },
    async (request, reply) => {
      const orgId = await autorizarContraOrganismoPadre(request, reply)
      if (orgId === null) return
      const { denominacionUnidad, localidadId, tipoUfId, anioImplementacion, domicilio, telefono, mail, responsable, codigoPostal } =
        request.body
      const firestoreIdSintetico = `api:${randomUUID()}`
      const { rows } = await pool.query(
        `INSERT INTO unidades_funcionales
           (organismo_id, denominacion_unidad, localidad_id, tipo_uf_id, anio_implementacion,
            domicilio, telefono, mail, responsable, codigo_postal, firestore_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         RETURNING *`,
        [
          orgId,
          denominacionUnidad,
          localidadId,
          tipoUfId,
          anioImplementacion ?? null,
          domicilio ?? null,
          telefono ?? null,
          mail ?? null,
          responsable ?? null,
          codigoPostal ?? null,
          firestoreIdSintetico,
        ],
      )
      reply.code(201)
      return rows[0]
    },
  )

  app.get('/api/organismos/:orgId/unidades-funcionales/:ufId', async (request, reply) => {
    const orgId = await autorizarContraOrganismoPadre(request, reply)
    if (orgId === null) return
    const ufId = idParam(request, 'ufId')
    const { rows } = await pool.query('SELECT * FROM unidades_funcionales WHERE id = $1 AND organismo_id = $2', [
      ufId,
      orgId,
    ])
    if (rows.length === 0) return reply.code(404).send({ error: 'No encontrado' })
    return rows[0]
  })

  app.patch<{ Body: Static<typeof ActualizarUFBody> }>(
    '/api/organismos/:orgId/unidades-funcionales/:ufId',
    { schema: { body: ActualizarUFBody } },
    async (request, reply) => {
      const orgId = await autorizarContraOrganismoPadre(request, reply)
      if (orgId === null) return
      const ufId = idParam(request, 'ufId')
      const b = request.body
      const { rows } = await pool.query(
        `UPDATE unidades_funcionales SET
           denominacion_unidad = COALESCE($3, denominacion_unidad),
           localidad_id = COALESCE($4, localidad_id),
           tipo_uf_id = COALESCE($5, tipo_uf_id),
           anio_implementacion = COALESCE($6, anio_implementacion),
           domicilio = COALESCE($7, domicilio),
           telefono = COALESCE($8, telefono),
           mail = COALESCE($9, mail),
           responsable = COALESCE($10, responsable),
           codigo_postal = COALESCE($11, codigo_postal)
         WHERE id = $1 AND organismo_id = $2
         RETURNING *`,
        [
          ufId,
          orgId,
          b.denominacionUnidad ?? null,
          b.localidadId ?? null,
          b.tipoUfId ?? null,
          b.anioImplementacion ?? null,
          b.domicilio ?? null,
          b.telefono ?? null,
          b.mail ?? null,
          b.responsable ?? null,
          b.codigoPostal ?? null,
        ],
      )
      if (rows.length === 0) return reply.code(404).send({ error: 'No encontrado' })
      return rows[0]
    },
  )

  app.delete('/api/organismos/:orgId/unidades-funcionales/:ufId', async (request, reply) => {
    const orgId = await autorizarContraOrganismoPadre(request, reply)
    if (orgId === null) return
    const ufId = idParam(request, 'ufId')
    const resultado = await pool.query('DELETE FROM unidades_funcionales WHERE id = $1 AND organismo_id = $2', [
      ufId,
      orgId,
    ])
    if (resultado.rowCount === 0) return reply.code(404).send({ error: 'No encontrado' })
    reply.code(204)
  })

  // --- Taxonomía (FR-014, 1:1 con el organismo) ---

  app.get('/api/organismos/:orgId/taxonomia', async (request, reply) => {
    const orgId = await autorizarContraOrganismoPadre(request, reply)
    if (orgId === null) return
    const { rows } = await pool.query('SELECT * FROM evaluaciones_taxonomicas WHERE organismo_id = $1', [orgId])
    if (rows.length === 0) return reply.code(404).send({ error: 'No encontrado' })
    return rows[0]
  })

  app.put<{ Body: TaxonomiaBody }>(
    '/api/organismos/:orgId/taxonomia',
    { schema: { body: TaxonomiaBody } },
    async (request, reply) => {
      const orgId = await autorizarContraOrganismoPadre(request, reply)
      if (orgId === null) return
      const b = request.body
      const { rows } = await pool.query(
        `INSERT INTO evaluaciones_taxonomicas
           (organismo_id, autonomia, insercion_institucional, jerarquia_normativa, dependencia,
            asistencia_jurisdiccional, alcance_proceso, alcance_fuero, presencia_territorial, grado_implementacion)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (organismo_id) DO UPDATE SET
           autonomia = EXCLUDED.autonomia,
           insercion_institucional = EXCLUDED.insercion_institucional,
           jerarquia_normativa = EXCLUDED.jerarquia_normativa,
           dependencia = EXCLUDED.dependencia,
           asistencia_jurisdiccional = EXCLUDED.asistencia_jurisdiccional,
           alcance_proceso = EXCLUDED.alcance_proceso,
           alcance_fuero = EXCLUDED.alcance_fuero,
           presencia_territorial = EXCLUDED.presencia_territorial,
           grado_implementacion = EXCLUDED.grado_implementacion
         RETURNING *`,
        [
          orgId,
          b.autonomia,
          b.insercionInstitucional,
          b.jerarquiaNormativa,
          b.dependencia,
          b.asistenciaJurisdiccional,
          b.alcanceProceso,
          b.alcanceFuero,
          b.presenciaTerritorial,
          b.gradoImplementacion,
        ],
      )
      return rows[0]
    },
  )
}
