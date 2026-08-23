// src/constants/organismoOptions.js

// Catálogo cerrado de 10 valores (migración de datos ya aplicada en Firestore
// a los 116 organismos existentes, ver SPEC.md). Reemplaza al listado anterior
// de 39 valores hardcodeados en mayúsculas.
export const denominacionSimplificadaOptions = [
  "Oficina Judicial",
  "Oficina de Gestión Asociada",
  "Oficina de Tramitación Integral",
  "Oficina de Gestión de Audiencias",
  "Oficina de Juicio por Jurados",
  "Oficina Judicial Especializada",
  "Oficina de Medidas Alternativas y Conciliación",
  "Dirección o Coordinación General de Oficinas Judiciales",
  "Mesa de Entradas Centralizada",
  "Unidad de Servicios Procesales"
];

export const tipoOficinaOptions = [
  "oficina judicial",
  "oficina judicial especializada",
  "coordinación",
  "unidad operativa"
];

export const fueroOptions = ["penal", "civil", "familia", "laboral", "multifuero"];

// No hay colección de Firestore con el listado completo de provincias
// (la colección `localidades` solo cubre las provincias que ya tienen
// localidades cargadas). Se hardcodea acá respetando la ortografía ya
// usada en `localidades` para no crear una grafía distinta que rompa
// agrupaciones por provincia en otras pantallas.
export const provinciaOptions = [
  "Buenos Aires",
  "CABA",
  "Catamarca",
  "Chaco",
  "Chubut",
  "Córdoba",
  "Corrientes",
  "Entre Rios",
  "Formosa",
  "Jujuy",
  "La Pampa",
  "La Rioja",
  "Mendoza",
  "Misiones",
  "Neuquén",
  "Rio Negro",
  "Salta",
  "San Juan",
  "San Luis",
  "Santa Cruz",
  "Santa Fe",
  "Santiago del Estero",
  "Tierra del Fuego",
  "Tucumán"
];
