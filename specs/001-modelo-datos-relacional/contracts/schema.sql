-- =============================================================================
-- Contrato del modelo relacional — Observatorio de Oficinas Judiciales
-- Feature: 001-modelo-datos-relacional
-- Motor: PostgreSQL 17 (self-hosted). Convención: snake_case.
--
-- Este archivo es el CONTRATO autoritativo del modelo. Justificación de cada
-- decisión: research.md. Descripción semántica: data-model.md.
-- No incluye datos de negocio; las semillas de catálogos van en db/seeds/.
-- =============================================================================

BEGIN;

-- Extensión para email case-insensitive por construcción del tipo (D-04).
CREATE EXTENSION IF NOT EXISTS citext;

-- ------------------------------------------------------------------ enums (D-05)
CREATE TYPE estado_fueros_enum AS ENUM (
  'cargado', 'multifuero_sin_detalle', 'sin_fueros_asignados'
);
-- (modo_jueces_enum eliminado: D8 reemplaza los tres estados de jueces por la
--  tabla puente unidad_funcional_grupo_jueces; ver §5, §6 y §6.5.)

-- ================================================ 1. Vocabularios controlados
CREATE TABLE provincias (
  id     smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre text NOT NULL UNIQUE
);

CREATE TABLE tipos_oficina (
  id     smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre text NOT NULL UNIQUE
);

CREATE TABLE denominaciones_simplificadas (
  id     smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre text NOT NULL UNIQUE
);

CREATE TABLE tipos_uf (
  id     smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre text NOT NULL UNIQUE
);

CREATE TABLE fueros (
  id     smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre text NOT NULL UNIQUE   -- 'multifuero' NO va aquí: es un valor calculado
);

CREATE TABLE roles (
  id     smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre text NOT NULL UNIQUE
);

-- Etiquetas de los códigos de taxonomía (para reporting). La validez de cada
-- código por columna la impone el CHECK de evaluaciones_taxonomicas.
CREATE TABLE taxonomia_codigos (
  dimension text     NOT NULL,
  codigo    text     NOT NULL,
  etiqueta  text     NOT NULL,
  orden     smallint,
  PRIMARY KEY (dimension, codigo)
);

-- ================================================================ 2. usuarios
CREATE TABLE usuarios (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email             citext  NOT NULL UNIQUE,        -- no es PK (Principio V, D4)
  nombre_display    text,
  email_verificado  boolean NOT NULL DEFAULT false,
  foto_url          text,
  provincia_id      smallint REFERENCES provincias (id),
  creado_a          timestamptz,
  ultimo_ingreso_a  timestamptz,
  creado_a_google   timestamptz,
  firestore_id      text NOT NULL UNIQUE            -- doc-id de origen (= email)
);

CREATE TABLE usuario_roles (
  usuario_id bigint   NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  rol_id     smallint NOT NULL REFERENCES roles (id),
  PRIMARY KEY (usuario_id, rol_id)
);

-- ============================================================== 3. organismos
CREATE TABLE organismos (
  id                            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  denominacion                  text     NOT NULL,
  denominacion_simplificada_id  smallint NOT NULL REFERENCES denominaciones_simplificadas (id),
  tipo_oficina_id               smallint NOT NULL REFERENCES tipos_oficina (id),
  provincia_id                  smallint NOT NULL REFERENCES provincias (id),
  propietario_id                bigint   NOT NULL REFERENCES usuarios (id),
  estado_fueros                 estado_fueros_enum NOT NULL,
  legacy_id                     integer,
  actualizado_a                 timestamptz NOT NULL,
  firestore_id                  text NOT NULL UNIQUE
);

CREATE TABLE organismo_editores (
  organismo_id bigint NOT NULL REFERENCES organismos (id) ON DELETE CASCADE,
  usuario_id   bigint NOT NULL REFERENCES usuarios (id),
  PRIMARY KEY (organismo_id, usuario_id)
);

CREATE TABLE organismo_fueros (
  organismo_id bigint   NOT NULL REFERENCES organismos (id) ON DELETE CASCADE,
  fuero_id     smallint NOT NULL REFERENCES fueros (id),
  PRIMARY KEY (organismo_id, fuero_id)
);

-- ============================================================== 4. localidades
CREATE TABLE localidades (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre       text     NOT NULL,
  provincia_id smallint NOT NULL REFERENCES provincias (id),
  latitud      double precision NOT NULL,
  longitud     double precision NOT NULL,
  firestore_id text NOT NULL UNIQUE,
  UNIQUE (nombre, provincia_id)                     -- V5.2: 0 duplicados
);

-- ============================================================= 5. grupos_jueces
-- Grupo de jueces con un TOTAL REAL (D8/FR-020). Puede ser un pool compartido
-- (varias UF lo referencian; origen: colección `pools_jueces`) o un grupo
-- exclusivo de una sola UF (derivado en la migración de las UF con cantidad
-- directa, modelado como grupo de un solo miembro). El total real es
-- independiente de las cantidades que cada UF le asigne.
CREATE TABLE grupos_jueces (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  descripcion  text,                                 -- NULL en grupos exclusivos derivados
  total_jueces integer  NOT NULL CHECK (total_jueces >= 0),
  provincia_id smallint NOT NULL REFERENCES provincias (id),
  firestore_id text UNIQUE                           -- doc-id de `pools_jueces`; NULL si exclusivo derivado
);

-- ==================================================== 6. unidades_funcionales
-- La asistencia de jueces NO vive en columnas de esta tabla (D8): se modela en
-- unidad_funcional_grupo_jueces (§6.5). Cero filas allí = sin jueces por diseño
-- (equivale al antiguo `no_aplica`), distinguible de un dato faltante.
CREATE TABLE unidades_funcionales (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organismo_id        bigint   NOT NULL REFERENCES organismos (id) ON DELETE CASCADE,
  denominacion_unidad text     NOT NULL,
  localidad_id        bigint   NOT NULL REFERENCES localidades (id),
  tipo_uf_id          smallint NOT NULL REFERENCES tipos_uf (id),
  anio_implementacion smallint,
  domicilio           text,
  telefono            text,
  mail                text,
  responsable         text,
  codigo_postal       text,
  firestore_id        text NOT NULL UNIQUE
);

-- ============================ 6.5 asignaciones de jueces (UF ↔ grupo) — D8/FR-017/FR-018
-- Tabla puente que reemplaza el modelo de tres estados. Una UF tiene 0..N
-- asignaciones; cada fila la vincula con un grupo y lleva la cantidad que esa
-- UF ve de ese grupo (su total real o un subconjunto numérico). Los subconjuntos
-- y el acceso completo al mismo grupo se solapan a propósito: NO se impone que
-- las cantidades asignadas a un grupo sumen su total (D8/FR-018d).
CREATE TABLE unidad_funcional_grupo_jueces (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  unidad_funcional_id bigint  NOT NULL REFERENCES unidades_funcionales (id) ON DELETE CASCADE,
  grupo_jueces_id     bigint  NOT NULL REFERENCES grupos_jueces (id),
  cantidad_asignada   integer NOT NULL CHECK (cantidad_asignada > 0),
  UNIQUE (unidad_funcional_id, grupo_jueces_id)      -- a lo sumo una asignación por (UF, grupo)
);

-- Fueros que atiende una asignación (FR-018f). El fuero es atributo de la
-- ASIGNACIÓN, no de la UF ni del grupo. Vacío = la asignación hereda todos los
-- fueros del organismo de la UF; con filas = subconjunto explícito. Restricción:
-- no puede exceder los fueros del organismo de la UF (trigger de abajo). La
-- agregación por fuero se hace por asignación.
CREATE TABLE asignacion_fueros (
  asignacion_id bigint   NOT NULL REFERENCES unidad_funcional_grupo_jueces (id) ON DELETE CASCADE,
  fuero_id      smallint NOT NULL REFERENCES fueros (id),
  PRIMARY KEY (asignacion_id, fuero_id)
);

-- FR-018f: cada fuero declarado en una asignación debe pertenecer a los fueros
-- del organismo de la UF que la origina (organismo_fueros). Es una restricción
-- de subconjunto entre tablas, no expresable con CHECK; se impone con trigger
-- (Principio VIII). En la migración inicial asignacion_fueros queda vacía (no
-- hay acotamientos de fuero en los datos actuales), así que el trigger no
-- dispara hasta que la carga posterior declare subconjuntos.
CREATE FUNCTION asignacion_fuero_dentro_de_uf() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM unidad_funcional_grupo_jueces a
    JOIN unidades_funcionales uf ON uf.id = a.unidad_funcional_id
    JOIN organismo_fueros ofu    ON ofu.organismo_id = uf.organismo_id
                                AND ofu.fuero_id = NEW.fuero_id
    WHERE a.id = NEW.asignacion_id
  ) THEN
    RAISE EXCEPTION
      'El fuero % de la asignación % excede los fueros del organismo de la UF (FR-018f)',
      NEW.fuero_id, NEW.asignacion_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_asignacion_fuero_dentro_de_uf
  BEFORE INSERT OR UPDATE ON asignacion_fueros
  FOR EACH ROW EXECUTE FUNCTION asignacion_fuero_dentro_de_uf();

-- =============================================== 7. evaluaciones_taxonomicas
-- PK sobre organismo_id impone "a lo sumo una por organismo" (1:1, D-12).
CREATE TABLE evaluaciones_taxonomicas (
  organismo_id              bigint PRIMARY KEY REFERENCES organismos (id) ON DELETE CASCADE,
  autonomia                 text NOT NULL CHECK (autonomia IN ('A','B','C','D')),
  insercion_institucional   text NOT NULL CHECK (insercion_institucional IN ('A','B','C')),
  jerarquia_normativa       text NOT NULL CHECK (jerarquia_normativa IN ('A','B','C','D')),
  dependencia               text NOT NULL CHECK (dependencia IN ('A','B','C','D')),
  asistencia_jurisdiccional text NOT NULL CHECK (asistencia_jurisdiccional IN ('A','B','C')),
  alcance_proceso           text NOT NULL CHECK (alcance_proceso IN ('A','B','C','D')),
  alcance_fuero             text NOT NULL CHECK (alcance_fuero IN ('A','B','C','E')),
  presencia_territorial     text NOT NULL CHECK (presencia_territorial IN ('A','B','C','D')),
  grado_implementacion      text NOT NULL CHECK (grado_implementacion IN ('A','B'))
);

-- =========================================== 8. vista_fuero_simplificado (D3)
CREATE VIEW vista_fuero_simplificado AS
SELECT
  o.id AS organismo_id,
  CASE
    WHEN o.estado_fueros = 'sin_fueros_asignados' THEN NULL
    WHEN o.estado_fueros = 'multifuero_sin_detalle' THEN 'multifuero'
    WHEN count(ofu.fuero_id) > 1 THEN 'multifuero'
    ELSE max(f.nombre)          -- estado 'cargado' con exactamente 1 fuero
  END AS fuero_simplificado
FROM organismos o
LEFT JOIN organismo_fueros ofu ON ofu.organismo_id = o.id
LEFT JOIN fueros f             ON f.id = ofu.fuero_id
GROUP BY o.id, o.estado_fueros;

-- ================================================= 9. migracion_reconciliacion
CREATE TABLE migracion_reconciliacion (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entidad       text    NOT NULL,
  conteo_origen integer NOT NULL,
  conteo_destino integer NOT NULL,
  resultado     text    NOT NULL CHECK (
                  resultado IN ('coincide','discrepancia_resuelta','discrepancia_abierta')),
  corrida_a     timestamptz NOT NULL DEFAULT now(),
  detalle       text
);

-- ------------------------------------------------- Índices sobre claves foráneas
-- (PostgreSQL no indexa las FK automáticamente; a esta escala es prolijidad más
--  que necesidad, pero deja el modelo listo para el backend.)
CREATE INDEX ix_organismos_propietario   ON organismos (propietario_id);
CREATE INDEX ix_organismos_provincia     ON organismos (provincia_id);
CREATE INDEX ix_uf_organismo             ON unidades_funcionales (organismo_id);
CREATE INDEX ix_uf_localidad             ON unidades_funcionales (localidad_id);
CREATE INDEX ix_ufgj_grupo               ON unidad_funcional_grupo_jueces (grupo_jueces_id);
CREATE INDEX ix_asignacion_fueros_fuero  ON asignacion_fueros (fuero_id);
CREATE INDEX ix_org_editores_usuario     ON organismo_editores (usuario_id);
CREATE INDEX ix_org_fueros_fuero         ON organismo_fueros (fuero_id);
CREATE INDEX ix_usuario_roles_rol        ON usuario_roles (rol_id);
CREATE INDEX ix_localidades_provincia    ON localidades (provincia_id);
CREATE INDEX ix_grupos_provincia         ON grupos_jueces (provincia_id);

COMMIT;
