// Normaliza organismos.denominacion y unidades_funcionales.denominacion_unidad: gran parte de la
// carga original vino en MAYÚSCULA SOSTENIDA. Regla acordada:
//   1. Todo a minúsculas y capitalizar la primera letra de cada palabra ("Título").
//   2. Excepción 1 — preposiciones/artículos/conjunciones (de, del, los, las, el, la, lo, en, para,
//      por, y, e, o, u): quedan en minúscula, salvo que sean la primera palabra de la denominación.
//      El pedido original no incluía y/e/o/u; se sumaron tras confirmar con el usuario, porque sin
//      ellas cada "y" de "Civil y Comercial" o "Familia y Sucesiones" pasaría a "Y" mayúscula.
//   3. Excepción 2 — un conjunto fijo de siglas: quedan siempre en mayúscula sostenida, nunca como
//      palabra normal. Empezó siendo solo OGA (con las variantes reales confirmadas contra los
//      datos, regexp `\mOGA[A-ZÁÉÍÓÚÑ]*\M`: OGA, OGAL, OGAP) y se amplió, tras ver el primer diff
//      completo, a OFIJU, OTIC, OTICCA, OTIF, OTIL, OTRAF, OGJ, OCE, OPS, TGA, OSPRO, OFIGA y LP
//      (esta última, "Ley Provincial", solo en organismos#297) — mismo tratamiento que OGA. El
//      plural ("OGAs") conserva la S final en minúscula.
// Cualquier OTRA sigla que no esté en esa lista (DAIyCG, GEJUAS, OMAS, OFIJUP...) NO tiene
// excepción: se capitaliza como palabra normal (OFIJUP -> Ofijup). Es deliberado, no un olvido:
// si aparece una sigla nueva que también deba quedar sostenida, hay que sumarla acá a mano.

// y/e/o/u/a/al sumadas al pedido original (confirmadas con el usuario, revisando la lista real de
// cambios antes de aplicar nada): sin "y", cada "y" de "Civil y Comercial" pasaría a "Y" mayúscula;
// sin "a"/"al", "proceso a prueba" y "asistencia al juez" (denominaciones reales) quedaban con la
// preposición en mayúscula ("Proceso A Prueba", "Asistencia Al Juez").
const PREPOSICIONES = new Set([
  'de', 'del', 'los', 'las', 'el', 'la', 'lo', 'en', 'para', 'por', 'y', 'e', 'o', 'u', 'a', 'al',
])
const SIGLAS_MAYUSCULAS = new Set([
  'oga', 'ogal', 'ogap',
  'ofiju', 'otic', 'oticca', 'otif', 'otil', 'otraf', 'ogj', 'oce', 'ops', 'tga', 'ospro', 'ofiga',
  'lp', // organismos#297: "Ley Provincial" — sumada a pedido explícito del usuario.
])

// Puntuación que puede envolver una palabra (paréntesis, comillas) sin formar parte de ella. NО
// incluye guiones ni dígitos: un token que empieza con un dígito o un guion ("2da.", "754-O") se
// deja pasar por la rama "no empieza con letra" de normalizarPalabra, sin forzar mayúscula alguna.
const PUNTUACION_INICIAL = /^[(«"'“]+/
const PUNTUACION_FINAL = /[)»"'”.,;:]+$/

function normalizarPalabra(palabra: string, esPrimera: boolean): string {
  const inicio = palabra.match(PUNTUACION_INICIAL)?.[0] ?? ''
  const sinInicio = palabra.slice(inicio.length)
  const fin = sinInicio.match(PUNTUACION_FINAL)?.[0] ?? ''
  const nucleo = fin ? sinInicio.slice(0, -fin.length) : sinInicio
  if (!nucleo) return palabra

  const minuscula = nucleo.toLowerCase()

  for (const sigla of SIGLAS_MAYUSCULAS) {
    if (minuscula === sigla) return inicio + sigla.toUpperCase() + fin
    if (minuscula === `${sigla}s`) return inicio + sigla.toUpperCase() + 's' + fin
  }

  if (!esPrimera && PREPOSICIONES.has(minuscula)) return inicio + minuscula + fin

  // "2da." o "754-O": el núcleo no empieza con una letra -> no hay "primera letra" que capitalizar,
  // se deja tal cual (solo pasado a minúscula, sin alterar dígitos ni símbolos).
  if (!/^\p{L}/u.test(nucleo)) return inicio + minuscula + fin

  return inicio + minuscula[0]!.toUpperCase() + minuscula.slice(1) + fin
}

/** Aplica la regla a una denominación completa. Colapsa además espacios repetidos (mismo "error de carga"). */
export function normalizarDenominacion(valor: string): string {
  const original = valor.trim()
  if (!original) return original
  return original
    .split(/\s+/)
    .map((palabra, i) => normalizarPalabra(palabra, i === 0))
    .join(' ')
}
