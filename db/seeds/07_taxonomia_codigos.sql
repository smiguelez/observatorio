-- Semilla: taxonomia_codigos (etiquetas por dimensión) — src/constants/taxonomiaOptions.js
-- Etiquetas para reporting; la validez de cada código por columna la impone el
-- CHECK de evaluaciones_taxonomicas (data-model.md §7).
INSERT INTO taxonomia_codigos (dimension, codigo, etiqueta, orden) VALUES
  -- institucional.insercion_institucional
  ('insercion_institucional', 'A', 'Reemplazó algún organismo, absorviendo tareas que ahora les son propias', 1),
  ('insercion_institucional', 'B', 'Se inserta como soporte al organismo o estructura tradicional que sigue existiendo', 2),
  ('insercion_institucional', 'C', 'Otro', 3),
  -- institucional.jerarquia_normativa
  ('jerarquia_normativa', 'A', 'Código Procesal', 1),
  ('jerarquia_normativa', 'B', 'Ley Orgánica', 2),
  ('jerarquia_normativa', 'C', 'Ley (No Código - No Ley Orgánica)', 3),
  ('jerarquia_normativa', 'D', 'Acordada/Resolución STJ', 4),
  -- organizacion.dependencia
  ('dependencia', 'A', 'Directamente de la Corte Suprema o Tribunal Superior de la Provincia', 1),
  ('dependencia', 'B', 'De una Coordinación o Dirección General', 2),
  ('dependencia', 'C', 'Jueces o colegio de jueces o parte jurisdiccional (foro, tribunal, etc.) a los que asiste', 3),
  ('dependencia', 'D', 'Otro', 4),
  -- organizacion.asistencia_jurisdiccional
  ('asistencia_jurisdiccional', 'A', 'a un mismo organismo jurisdiccional siempre', 1),
  ('asistencia_jurisdiccional', 'B', 'a más de un mismo organismo jurisdiccional siempre', 2),
  ('asistencia_jurisdiccional', 'C', 'un órgano colegiado de jueces (foro, cámara, colegio, etc)', 3),
  -- gestion.autonomia
  ('autonomia', 'A', 'por decisión de la propia oficina judicial', 1),
  ('autonomia', 'B', 'A requerimiento de otro organismo', 2),
  ('autonomia', 'C', 'No da soporte a la actividad jurisdiccional', 3),
  ('autonomia', 'D', 'Otro', 4),
  -- implementacion.alcance_proceso
  ('alcance_proceso', 'A', 'En todo el proceso hasta la resolución definitiva (gestiona el caso)', 1),
  ('alcance_proceso', 'B', 'Parcialmente, a partir de una etapa procesal específica', 2),
  ('alcance_proceso', 'C', 'Parcialmente, gestionando un acto procesal específico (por ej., audiencia o juicio por jurados)', 3),
  ('alcance_proceso', 'D', 'Otro', 4),
  -- implementacion.alcance_fuero
  ('alcance_fuero', 'A', 'Organismo que asiste a todo el fuero sin excepción', 1),
  ('alcance_fuero', 'B', 'Organismo que asiste a gran parte del fuero', 2),
  ('alcance_fuero', 'C', 'Organismo que asiste a una parte específica del fuero', 3),
  ('alcance_fuero', 'E', 'Otro', 4),
  -- implementacion.presencia_territorial
  ('presencia_territorial', 'A', 'Único organismo, competencia provincial', 1),
  ('presencia_territorial', 'B', 'Implementada solo en circunscripción capital', 2),
  ('presencia_territorial', 'C', 'Están presente en solamente algunas de las Circunscripciones Judiciales', 3),
  ('presencia_territorial', 'D', 'Ubicadas en las cabeceras de cada Circunscripción Judicial, y tienen subdelegaciones en otras localidades de esa Circunscripción', 4),
  -- implementacion.grado_implementacion
  ('grado_implementacion', 'A', 'Implementada', 1),
  ('grado_implementacion', 'B', 'En proceso', 2);
