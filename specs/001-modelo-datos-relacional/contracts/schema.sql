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
CREATE TYPE modo_jueces_enum AS ENUM (
  'cantidad_directa', 'pool', 'no_aplica'
);

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

-- ============================================================= 5. pools_jueces
CREATE TABLE pools_jueces (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  descripcion     text     NOT NULL,
  cantidad_jueces integer  NOT NULL CHECK (cantidad_jueces >= 0),
  provincia_id    smallint NOT NULL REFERENCES provincias (id),
  firestore_id    text NOT NULL UNIQUE
);

-- ==================================================== 6. unidades_funcionales
CREATE TABLE unidades_funcionales (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organismo_id        bigint   NOT NULL REFERENCES organismos (id) ON DELETE CASCADE,
  denominacion_unidad text     NOT NULL,
  localidad_id        bigint   NOT NULL REFERENCES localidades (id),
  tipo_uf_id          smallint NOT NULL REFERENCES tipos_uf (id),
  modo_jueces         modo_jueces_enum NOT NULL,
  jueces_asistidos    integer  CHECK (jueces_asistidos >= 0),
  pool_jueces_id      bigint   REFERENCES pools_jueces (id),
  anio_implementacion smallint,
  domicilio           text,
  telefono            text,
  mail                text,
  responsable         text,
  codigo_postal       text,
  firestore_id        text NOT NULL UNIQUE,
  -- Exclusividad de los tres modos de jueces (D6 / D-07):
  CONSTRAINT modo_jueces_exclusivo CHECK (
    (modo_jueces = 'cantidad_directa'
       AND jueces_asistidos IS NOT NULL AND pool_jueces_id IS NULL)
    OR (modo_jueces = 'pool'
       AND pool_jueces_id IS NOT NULL AND jueces_asistidos IS NULL)
    OR (modo_jueces = 'no_aplica'
       AND jueces_asistidos IS NULL AND pool_jueces_id IS NULL)
  )
);

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
CREATE INDEX ix_uf_pool                  ON unidades_funcionales (pool_jueces_id);
CREATE INDEX ix_org_editores_usuario     ON organismo_editores (usuario_id);
CREATE INDEX ix_org_fueros_fuero         ON organismo_fueros (fuero_id);
CREATE INDEX ix_usuario_roles_rol        ON usuario_roles (rol_id);
CREATE INDEX ix_localidades_provincia    ON localidades (provincia_id);
CREATE INDEX ix_pools_provincia          ON pools_jueces (provincia_id);

COMMIT;
