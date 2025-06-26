// Este script importa datos normalizados de un .csv a la subcolección 'taxonomia'
// de cada organismo en Firestore, buscando por el campo 'legacy_id'

import Papa from 'papaparse';
import { collection, getDocs, query, where, doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

// Diccionarios de mapeo
const insercionInstitucionalMap = {
  "Reemplazó algún organismo, absorviendo tareas que ahora les son propias": "A",
  "Se inserta como soporte al organismo o estructura tradicional que sigue existiendo": "B",
  "Otro": "C"
};

const jerarquiaNormativaMap = {
  "Codigo Procesal": "A",
  "Ley Orgánica": "B",
  "Ley (No Código - No Ley Orgánica)": "C",
  "Acordada/Resolución STJ": "D"
};

const dependenciaMap = {
  "directamente de la Corte Suprema o Tribunal Superior de la Provincia": "A",
  "Directamente de la Corte Suprema o Tribunal Superior de la Provincia": "A",
  "De una Coordinación o Dirección General": "B",
  "Jueces o colegio de jueces o parte jurisdiccional (foro, tribunal, etc.) a los que asiste": "C",
  "Otro": "D"
};

const asistenciaJurisdiccionalMap = {
  "a un mismo organismo jurisdiccional siempre" : "A",
  "a mas de un mismo organismo siempre" : "B",
  "un órgano colegiado de jueces (foro, cámara, colegio, etc)" : "C",
  "coordinación sin asistencia a función jurisdiccional" : "D"
};

const autonomiaMap = {
  "por decisión de la propia oficina judicial" : "A",
  "a requerimiento de otro organismo" : "B",
  "No da soporte a la actividad jurisdiccional." : "C",
  "Otro" : "D",
  "otro" : "D"
};

const alcanceProcesoMap = {
  "En todo el proceso hasta la resolución definitiva (gestiona el caso)" : "A",
  "Parcialmente, a partir de una etapa procesal especifica" : "B",
  "Parcialmente, gestionando un acto procesal especifico (por ej, gestionar la audiencia, gestión de juicio por jurados, etc)." : "C",
  "Otro": "D"
};

const alcanceFueroMap = {
  "Organismo que asiste a todo el fuero sin excepción" : "A",
  "Organismo que asiste a gran parte del fuero pero quedan otras áreas fuera de su órbita" : "B",
  "Organismo que asiste a una parte específica del fuero" : "C",
  "Coordinación de dos o más organismos" : "D",
  "Otro": "E"
};

const presenciaTerritorialMap = {
  "solamente ubicada en la Circunscripción capital" : "A",
  "Itinerantes y recorren distintas localidades" : "A",
  "Solamente ubicadas en las cabeceras de cada Circunscripción Judicial" : "B",
  "Están presente en solamente algunas de las Circunscripciones Judiciales" : "C",
  "Ubicadas en las cabeceras de cada Circunscripción Judicial, y tienen subdelegaciones en otras localidades de esa Circunscripción" : "D",
  "Otro" : "F"
};

const gradoImplementacionMap = {
  "Implementada": "A",
  "En proceso" : "B",
  "" : "B"
};

// Funciones de utilidad
const clean = (str) => str?.trim().replace(/^"|"$/g, '').replace(/\s+/g, ' ');

// Función principal
export async function importarTaxonomiaDesdeCSV(file) {
  console.log("Iniciando importación...");
  Papa.parse(file, {
    header: false,
    skipEmptyLines: true,
    complete: async function (results) {
      for (const row of results.data) {
        const legacy_id = clean(row[0]);

        const q = query(collection(db, 'organismos'), where('legacy_id', '==', legacy_id));
        const snapshot = await getDocs(q);
        if (snapshot.empty) {
          console.warn(`Organismo con legacy_id ${legacy_id} no encontrado.`);
          continue;
        }

        const docRef = snapshot.docs[0].ref;
        const taxRef = doc(docRef, 'taxonomia', 'v1');

        const data = {
          institucional: {
            insercion_institucional: insercionInstitucionalMap[clean(row[1])],
            jerarquia_normativa: jerarquiaNormativaMap[clean(row[2])]
          },
          organizacion: {
            dependencia: dependenciaMap[clean(row[3])],
            asistencia_jurisdiccional: asistenciaJurisdiccionalMap[clean(row[4])]
          },
          gestion: {
            autonomia: autonomiaMap[clean(row[5])]
          },
          implementacion: {
            alcance_proceso: alcanceProcesoMap[clean(row[6])],
            alcance_fuero: alcanceFueroMap[clean(row[7])],
            presencia_territorial: presenciaTerritorialMap[clean(row[8])],
            grado_implementacion: gradoImplementacionMap[clean(row[9])]
          }
        };

        try {
          await setDoc(taxRef, data);
          console.log(`✅ Taxonomía actualizada para legacy_id ${legacy_id}`);
        } catch (err) {
          console.error(`❌ Error actualizando taxonomía para legacy_id ${legacy_id}:`, err);
        }
      }
      console.log("Finalizó la importación");
    }
  });
}
