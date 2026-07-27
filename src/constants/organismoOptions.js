// src/constants/organismoOptions.js

export const denominacionSimplificadaOptions = [
  "OFICINA JUDICIAL",
  "OFICINA DE IMPUGNACIÓN",
  "DIRECCION GRAL DE OFICINAS JUDICIALES",
  "OFICINA DE TRAMITACION INTEGRAL",
  "COORDINACION OFICINAS JUDICIALES",
  "OFICINA DE GESTIÓN DE AUDIENCIAS",
  "OFICINA DE GESTIÓN UNICA",
  "OFICINA JUDICIAL CENTRAL",
  "OFICINA JUDICIAL DE JUICIO POR JURADOS",
  "OFICINA DE GESTIÓN UNIFICADA",
  "TRIBUNAL DE GESTIÓN ASOCIADA",
  "OFICINA DE PROCESOS",
  "OFICINA DE TRAMITES",
  "OFICINA GESTIÓN Y APOYO",
  "OFICINA DE GESTIÓN JUDICIAL",
  "OFICINA DE RECEPCIÓN DE EXPEDIENTES",
  "MESA ENTRADAS",
  "OFICINA DE COORDINACIÓN",
  "OFICINA UNICA",
  "OFICINA DE ATENCIÓN CENTRALIZADA",
  "OFICINA DE ENTRADA",
  "UNIDAD DE SEGUIMIENTO",
  "UNIDAD DE COORDINACIÓN",
  "OFICINA DE SERVICIOS PROCESALES",
  "OFICINA DE JURADOS",
  "OFICINA DE GESTIÓN COMUN",
  "OFICINA DE PROCESOS SUCESORIOS",
  "SECRETARIA DE GESTIÓN ADMINISTRATIVA",
  "OFICINA DE GESTIÓN ADMINISTRATIVA",
  "OFICINA JUDICIAL DE GESTIÓN ASOCIADA",
  "GESTIÓN JUDICIAL ASOCIADA",
  "OFICINA JUDICIAL DE AUDIENCIAS",
  "OFICINA CENTRAL DE JUICIOS POR JURADOS",
  "OFICINA DE GESTION ASOCIADA",
  "COORDINACION OGA",
  "OFICINA DE COORDINACION ESTRATEGICA DE PLANIFICACION Y GESTION",
  "OFICINA DE GESTION JUDICIAL",
  "OFICINA DE GESTIÓN DIGITAL",
  "COMISIÓN TÉCNICA"
];

export const tipoOficinaOptions = [
  "oficina judicial",
  "oficina judicial especializada",
  "coordinación",
  "unidad operativa"
];

export const fueroOptions = ["penal", "civil", "familia", "laboral"];

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
