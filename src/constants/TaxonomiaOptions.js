// src/constants/taxonomiaOptions.js

export const taxonomiaOptions = {
  institucional: {
    insercion_institucional: [
      { value: "A", label: "Reemplazó algún organismo, absorviendo tareas que ahora les son propias" },
      { value: "B", label: "Se inserta como soporte al organismo o estructura tradicional que sigue existiendo" },
      { value: "C", label: "Otro" }
    ],
    jerarquia_normativa: [
      { value: "A", label: "Código Procesal" },
      { value: "B", label: "Ley Orgánica" },
      { value: "C", label: "Ley (No Código - No Ley Orgánica)" },
      { value: "D", label: "Acordada/Resolución STJ" }
    ]
  },
  organizacion: {
    dependencia: [
      { value: "A", label: "Directamente de la Corte Suprema o Tribunal Superior de la Provincia" },
      { value: "B", label: "De una Coordinación o Dirección General" },
      { value: "C", label: "Jueces o colegio de jueces o parte jurisdiccional (foro, tribunal, etc.) a los que asiste" },
      { value: "D", label: "Otro" }
    ],
    asistencia_jurisdiccional: [
      { value: "A", label: "a un mismo organismo jurisdiccional siempre" },
      { value: "B", label: "a más de un mismo organismo jurisdiccional siempre" },
      { value: "C", label: "un órgano colegiado de jueces (foro, cámara, colegio, etc)" }
    ]
  },
  gestion: {
    autonomia: [
      { value: "A", label: "por decisión de la propia oficina judicial" },
      { value: "B", label: "A requerimiento de otro organismo" },
      { value: "C", label: "No da soporte a la actividad jurisdiccional" },
      { value: "D", label: "Otro" }
    ]
  },
  implementacion: {
    alcance_proceso: [
      { value: "A", label: "En todo el proceso hasta la resolución definitiva (gestiona el caso)" },
      { value: "B", label: "Parcialmente, a partir de una etapa procesal específica" },
      { value: "C", label: "Parcialmente, gestionando un acto procesal específico (por ej., audiencia o juicio por jurados)" },
      { value: "D", label: "Otro" }
    ],
    alcance_fuero: [
      { value: "A", label: "Organismo que asiste a todo el fuero sin excepción" },
      { value: "B", label: "Organismo que asiste a gran parte del fuero" },
      { value: "C", label: "Organismo que asiste a una parte específica del fuero" },
      { value: "E", label: "Otro" }
    ],
    presencia_territorial: [
      { value: "A", label: "Único organismo, competencia provincial" },
      { value: "B", label: "Implementada solo en circunscripción capital" },
      { value: "C", label: "Están presente en solamente algunas de las Circunscripciones Judiciales" },
      { value: "D", label: "Ubicadas en las cabeceras de cada Circunscripción Judicial, y tienen subdelegaciones en otras localidades de esa Circunscripción" }
    ],
    grado_implementacion: [
      { value: "A", label: "Implementada" },
      { value: "B", label: "En proceso" }
    ]
  }
};
