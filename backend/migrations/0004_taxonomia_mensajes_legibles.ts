// Migración 0004 — mensajes de rechazo de los triggers de taxonomía legibles para una persona
// (007-identidad-autorizacion, US7, D18, FR-009 de 004).
//
// Los RAISE EXCEPTION de 0001 (validar_respuesta_taxonomia) y 0003 (validar_pregunta_tipo_organismo) nombran la
// pregunta por su id interno ("la pregunta 1 no aplica…"), que la API nunca expone. Acá se reemplazan las funciones
// (CREATE OR REPLACE — los triggers siguen apuntando a ellas) para que el mensaje nombre la pregunta por su CÓDIGO
// público (más el texto si difiere, D19) y no incluya ids, nombres de tabla ni referencias a FR-xxx. Cada rechazo
// que identifica una pregunta agrega `USING DETAIL = 'preguntaCodigo=<codigo>'`: dato estructurado que la API lee
// de `err.detail` (campo de `pg`, independiente del idioma del servidor) sin parsear texto libre.
//
// Solo reemplaza funciones: no toca tablas ni datos (Principio X: no hay nada que reconciliar). `down` restaura
// las definiciones originales de 0001 y 0003 y elimina la función auxiliar. Una migración aplicada no se edita.
import { Kysely, sql } from 'kysely'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    CREATE FUNCTION taxonomia_pregunta_rotulo(p_pregunta_id bigint) RETURNS text AS $$
      SELECT '«' || codigo || '»' || CASE WHEN texto IS DISTINCT FROM codigo THEN ' (' || texto || ')' ELSE '' END
      FROM taxonomia_preguntas WHERE id = p_pregunta_id;
    $$ LANGUAGE sql STABLE
  `.execute(db)

  await sql`
    CREATE OR REPLACE FUNCTION validar_respuesta_taxonomia() RETURNS trigger AS $$
    DECLARE
      v_tipo_respuesta text;
      v_opcion_pregunta_id bigint;
      v_ya_existe boolean;
      v_rotulo text;
      v_codigo text;
    BEGIN
      SELECT tipo_respuesta, codigo INTO v_tipo_respuesta, v_codigo
      FROM taxonomia_preguntas WHERE id = NEW.pregunta_id;

      IF v_tipo_respuesta IS NULL THEN
        RAISE EXCEPTION 'La pregunta indicada no existe.';
      END IF;
      v_rotulo := taxonomia_pregunta_rotulo(NEW.pregunta_id);

      IF NEW.opcion_id IS NOT NULL THEN
        SELECT pregunta_id INTO v_opcion_pregunta_id
        FROM taxonomia_opciones WHERE id = NEW.opcion_id;

        IF v_opcion_pregunta_id IS DISTINCT FROM NEW.pregunta_id THEN
          RAISE EXCEPTION 'La opción indicada no pertenece a la pregunta %.', v_rotulo
            USING DETAIL = 'preguntaCodigo=' || v_codigo;
        END IF;
      END IF;

      IF v_tipo_respuesta IN ('opcion_unica', 'opcion_multiple') THEN
        IF NEW.opcion_id IS NULL OR NEW.valor_texto IS NOT NULL OR NEW.valor_numero IS NOT NULL THEN
          RAISE EXCEPTION 'La pregunta % admite %; se recibió un valor de otro tipo.', v_rotulo,
            CASE v_tipo_respuesta WHEN 'opcion_unica' THEN 'una opción' ELSE 'opciones' END
            USING DETAIL = 'preguntaCodigo=' || v_codigo;
        END IF;
      ELSIF v_tipo_respuesta = 'numerica' THEN
        IF NEW.valor_numero IS NULL OR NEW.opcion_id IS NOT NULL OR NEW.valor_texto IS NOT NULL THEN
          RAISE EXCEPTION 'La pregunta % admite un valor numérico; se recibió un valor de otro tipo.', v_rotulo
            USING DETAIL = 'preguntaCodigo=' || v_codigo;
        END IF;
      ELSIF v_tipo_respuesta = 'texto_libre' THEN
        IF NEW.valor_texto IS NULL OR NEW.opcion_id IS NOT NULL OR NEW.valor_numero IS NOT NULL THEN
          RAISE EXCEPTION 'La pregunta % admite un texto; se recibió un valor de otro tipo.', v_rotulo
            USING DETAIL = 'preguntaCodigo=' || v_codigo;
        END IF;
      END IF;

      IF v_tipo_respuesta != 'opcion_multiple' THEN
        SELECT EXISTS (
          SELECT 1 FROM evaluaciones_taxonomicas
          WHERE organismo_id = NEW.organismo_id
            AND pregunta_id = NEW.pregunta_id
            AND id IS DISTINCT FROM NEW.id
        ) INTO v_ya_existe;

        IF v_ya_existe THEN
          RAISE EXCEPTION 'La pregunta % admite una sola respuesta.', v_rotulo
            USING DETAIL = 'preguntaCodigo=' || v_codigo;
        END IF;
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db)

  await sql`
    CREATE OR REPLACE FUNCTION validar_pregunta_tipo_organismo() RETURNS trigger AS $$
    DECLARE
      v_tipo_oficina_id smallint;
    BEGIN
      SELECT tipo_oficina_id INTO v_tipo_oficina_id FROM organismos WHERE id = NEW.organismo_id;

      IF v_tipo_oficina_id IS NULL THEN
        RAISE EXCEPTION 'El organismo indicado no existe.';
      END IF;

      IF NOT taxonomia_pregunta_aplica_a_tipo(NEW.pregunta_id, v_tipo_oficina_id) THEN
        RAISE EXCEPTION 'La pregunta % no aplica al tipo de organismo actual.', taxonomia_pregunta_rotulo(NEW.pregunta_id)
          USING DETAIL = 'preguntaCodigo=' || (SELECT codigo FROM taxonomia_preguntas WHERE id = NEW.pregunta_id);
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  // Definiciones originales, tal como las dejaron 0001 y 0003.
  await sql`
    CREATE OR REPLACE FUNCTION validar_respuesta_taxonomia() RETURNS trigger AS $$
    DECLARE
      v_tipo_respuesta text;
      v_opcion_pregunta_id bigint;
      v_ya_existe boolean;
    BEGIN
      SELECT tipo_respuesta INTO v_tipo_respuesta
      FROM taxonomia_preguntas WHERE id = NEW.pregunta_id;

      IF v_tipo_respuesta IS NULL THEN
        RAISE EXCEPTION 'evaluaciones_taxonomicas: pregunta_id % no existe', NEW.pregunta_id;
      END IF;

      IF NEW.opcion_id IS NOT NULL THEN
        SELECT pregunta_id INTO v_opcion_pregunta_id
        FROM taxonomia_opciones WHERE id = NEW.opcion_id;

        IF v_opcion_pregunta_id IS DISTINCT FROM NEW.pregunta_id THEN
          RAISE EXCEPTION
            'evaluaciones_taxonomicas: la opción % pertenece a la pregunta %, no a la pregunta % de esta respuesta (FR-007)',
            NEW.opcion_id, v_opcion_pregunta_id, NEW.pregunta_id;
        END IF;
      END IF;

      IF v_tipo_respuesta IN ('opcion_unica', 'opcion_multiple') THEN
        IF NEW.opcion_id IS NULL OR NEW.valor_texto IS NOT NULL OR NEW.valor_numero IS NOT NULL THEN
          RAISE EXCEPTION
            'evaluaciones_taxonomicas: la pregunta % es % — la respuesta debe traer opcion_id y nada más (FR-004/FR-008)',
            NEW.pregunta_id, v_tipo_respuesta;
        END IF;
      ELSIF v_tipo_respuesta = 'numerica' THEN
        IF NEW.valor_numero IS NULL OR NEW.opcion_id IS NOT NULL OR NEW.valor_texto IS NOT NULL THEN
          RAISE EXCEPTION
            'evaluaciones_taxonomicas: la pregunta % es numerica — la respuesta debe traer valor_numero y nada más (FR-008)',
            NEW.pregunta_id;
        END IF;
      ELSIF v_tipo_respuesta = 'texto_libre' THEN
        IF NEW.valor_texto IS NULL OR NEW.opcion_id IS NOT NULL OR NEW.valor_numero IS NOT NULL THEN
          RAISE EXCEPTION
            'evaluaciones_taxonomicas: la pregunta % es texto_libre — la respuesta debe traer valor_texto y nada más (FR-008)',
            NEW.pregunta_id;
        END IF;
      END IF;

      IF v_tipo_respuesta != 'opcion_multiple' THEN
        SELECT EXISTS (
          SELECT 1 FROM evaluaciones_taxonomicas
          WHERE organismo_id = NEW.organismo_id
            AND pregunta_id = NEW.pregunta_id
            AND id IS DISTINCT FROM NEW.id
        ) INTO v_ya_existe;

        IF v_ya_existe THEN
          RAISE EXCEPTION
            'evaluaciones_taxonomicas: ya existe una respuesta de organismo % a la pregunta % (no es opcion_multiple — FR-006)',
            NEW.organismo_id, NEW.pregunta_id;
        END IF;
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db)

  await sql`
    CREATE OR REPLACE FUNCTION validar_pregunta_tipo_organismo() RETURNS trigger AS $$
    DECLARE
      v_tipo_oficina_id smallint;
    BEGIN
      SELECT tipo_oficina_id INTO v_tipo_oficina_id FROM organismos WHERE id = NEW.organismo_id;

      IF v_tipo_oficina_id IS NULL THEN
        RAISE EXCEPTION 'evaluaciones_taxonomicas: organismo_id % no existe', NEW.organismo_id;
      END IF;

      IF NOT taxonomia_pregunta_aplica_a_tipo(NEW.pregunta_id, v_tipo_oficina_id) THEN
        RAISE EXCEPTION
          'evaluaciones_taxonomicas: la pregunta % no aplica al tipo de organismo actual (tipo_oficina_id=%) del organismo % (Protección A)',
          NEW.pregunta_id, v_tipo_oficina_id, NEW.organismo_id;
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db)

  await sql`DROP FUNCTION IF EXISTS taxonomia_pregunta_rotulo(bigint)`.execute(db)
}
