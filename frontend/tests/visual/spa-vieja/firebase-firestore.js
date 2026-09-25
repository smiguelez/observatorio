// Stub de `firebase/firestore`: base en memoria con datos SINTÉTICOS. Implementa solo lo que usa la SPA vieja.
const datos = new Map() // ruta de colección -> Map(id -> objeto)
const col = (ruta) => { if (!datos.has(ruta)) datos.set(ruta, new Map()); return datos.get(ruta) }
const poner = (ruta, id, obj) => col(ruta).set(id, obj)

// ---- Datos de ejemplo ----
poner('users', 'usuario@ejemplo.test', { rol: ['usuario_normal'], provincia: 'Córdoba', displayName: 'Usuario de Ejemplo' })
const orgs = [
  ['org-a', { denominacion: 'Organismo de ejemplo A', denominacion_simplificada: 'Oficina Judicial', tipo_oficina: 'oficina judicial', provincia: 'Córdoba', fuero_simplificado: 'penal', usuario_google: 'usuario@ejemplo.test', editores: [] }],
  ['org-b', { denominacion: 'Organismo de ejemplo B', denominacion_simplificada: 'Oficina de Gestión Asociada', tipo_oficina: 'oficina judicial especializada', provincia: 'Córdoba', fuero_simplificado: 'multifuero', usuario_google: 'usuario@ejemplo.test', editores: [] }],
  ['org-c', { denominacion: 'Organismo de ejemplo C', denominacion_simplificada: 'Coordinación', tipo_oficina: 'coordinación', provincia: 'Córdoba', fuero_simplificado: 'civil', usuario_google: 'usuario@ejemplo.test', editores: [] }],
]
orgs.forEach(([id, o]) => poner('organismos', id, o))
poner('organismos/org-a/unidades_funcionales', 'uf-1', { denominacion_unidad: 'Unidad de ejemplo 1' })
poner('organismos/org-a/unidades_funcionales', 'uf-2', { denominacion_unidad: 'Unidad de ejemplo 2' })
poner('organismos/org-b/unidades_funcionales', 'uf-1', { denominacion_unidad: 'Unidad de ejemplo 3' })
poner('organismos/org-a/taxonomia', 'v1', {
  institucional: { insercion_institucional: 'A', jerarquia_normativa: 'B' },
  organizacion: { dependencia: 'A', asistencia_jurisdiccional: '' },
  gestion: { autonomia: '' },
  implementacion: { alcance_proceso: 'A', alcance_fuero: '', presencia_territorial: '', grado_implementacion: '' },
})

// ---- API mínima ----
export const getFirestore = () => ({})
export const serverTimestamp = () => new Date().toISOString()
export const arrayUnion = (...v) => ({ __union: v })
export const arrayRemove = (...v) => ({ __remove: v })
export const collection = (_db, ...seg) => ({ tipo: 'col', ruta: seg.join('/') })
export const doc = (base, ...seg) => (base?.tipo === 'col' ? { tipo: 'doc', ruta: `${base.ruta}/${seg.join('/')}` } : { tipo: 'doc', ruta: seg.join('/') })
const partir = (rutaDoc) => { const i = rutaDoc.lastIndexOf('/'); return [rutaDoc.slice(0, i), rutaDoc.slice(i + 1)] }
export const where = (campo, op, valor) => ({ campo, op, valor })
export const query = (c, ...restricciones) => ({ tipo: 'query', ruta: c.ruta, restricciones })
const cumple = (obj, { campo, op, valor }) => (op === '==' ? obj[campo] === valor : op === 'array-contains' ? (obj[campo] || []).includes(valor) : true)
const snap = (id, obj) => ({ id, data: () => ({ ...obj }), exists: () => true })
export const getDocs = async (q) => {
  const ruta = q.ruta
  const filas = [...col(ruta).entries()].filter(([, o]) => (q.restricciones || []).every((r) => cumple(o, r)))
  const docs = filas.map(([id, o]) => snap(id, o))
  return { docs, size: docs.length, empty: docs.length === 0, forEach: (f) => docs.forEach(f) }
}
export const getDoc = async (d) => {
  const [ruta, id] = partir(d.ruta)
  const o = col(ruta).get(id)
  return o ? snap(id, o) : { id, exists: () => false, data: () => undefined }
}
export const setDoc = async (d, obj, opciones) => { const [r, id] = partir(d.ruta); poner(r, id, opciones?.merge ? { ...(col(r).get(id) || {}), ...obj } : obj) }
export const updateDoc = async (d, obj) => { const [r, id] = partir(d.ruta); poner(r, id, { ...(col(r).get(id) || {}), ...obj }) }
export const addDoc = async (c, obj) => { const id = `nuevo-${col(c.ruta).size + 1}`; poner(c.ruta, id, obj); return { id } }
export const deleteDoc = async (d) => { const [r, id] = partir(d.ruta); col(r).delete(id) }
