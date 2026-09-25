// Graba respuestas REALES del backend en tests/unit/api/fixtures/real/*.json (base de la suite de contrato
// de la capa de mapeo, D13). Uso (backend corriendo con BETTER_AUTH_URL=http://localhost:5173):
//   DATABASE_URL=... node scripts/grabar-fixtures.mjs
// Crea usuarios/organismos con prefijo `test-frontend-` y los BORRA al terminar. Los datos de usuarios
// reales NO se graban: en /api/usuarios se conserva la forma pero se reemplazan email y nombre (PII), y en
// /api/pools-jueces las descripciones (identifican oficinas).
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'

const BACKEND = 'http://localhost:3000'
const ORIGEN = 'http://localhost:5173'
const P = 'test-frontend-fx'
const EMAIL = `${P}@example.test`
const OTRO = `${P}-otro@example.test`
const CLAVE = 'contrasena-test-12345'
const OUT = new URL('../tests/unit/api/fixtures/real/', import.meta.url).pathname
const psql = (sql) => execFileSync('psql', [process.env.DATABASE_URL, '-Atc', sql], { encoding: 'utf8' }).trim()

function limpiar() {
  for (const q of [
    `DELETE FROM organismo_editores WHERE usuario_id IN (SELECT id FROM usuarios WHERE email LIKE '${P}%')`,
    `DELETE FROM organismos WHERE propietario_id IN (SELECT id FROM usuarios WHERE email LIKE '${P}%')`,
    `DELETE FROM auth.session WHERE "userId" IN (SELECT id::text FROM usuarios WHERE email LIKE '${P}%')`,
    `DELETE FROM auth.account WHERE "userId" IN (SELECT id::text FROM usuarios WHERE email LIKE '${P}%')`,
    `DELETE FROM auth."user" WHERE email LIKE '${P}%'`,
    `DELETE FROM usuarios WHERE email LIKE '${P}%'`,
    `DELETE FROM grupos_jueces WHERE descripcion LIKE '${P}%'`,
  ]) psql(q)
}

async function signUp(email) {
  const r = await fetch(`${BACKEND}/api/auth/sign-up/email`, { method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGEN }, body: JSON.stringify({ email, password: CLAVE, name: 'Fixture' }) })
  if (!r.ok) throw new Error(`sign-up ${r.status}`)
  return r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ')
}

limpiar()
mkdirSync(OUT, { recursive: true })
try {
  const cookie = await signUp(EMAIL)
  await signUp(OTRO)
  psql(`UPDATE usuarios SET provincia_id = 1, nombre_display = 'Fixture' WHERE email = '${EMAIL}'`)
  const llamar = async (metodo, ruta, cuerpo) => {
    const r = await fetch(`${BACKEND}${ruta}`, { method: metodo, headers: cuerpo === undefined ? { cookie } : { 'content-type': 'application/json', cookie }, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) })
    const t = await r.text()
    return { status: r.status, json: t ? JSON.parse(t) : null }
  }
  const guardar = (nombre, valor) => writeFileSync(`${OUT}${nombre}.json`, JSON.stringify(valor, null, 2) + '\n')

  const org = (await llamar('POST', '/api/organismos', { denominacion: `${P} org`, denominacionSimplificadaId: 1, tipoOficinaId: 1, provinciaId: 1 })).json
  const localidad = psql('SELECT id FROM localidades WHERE provincia_id = 1 ORDER BY id LIMIT 1')
  const uf = (await llamar('POST', `/api/organismos/${org.id}/unidades-funcionales`, { denominacionUnidad: 'uf fx', localidadId: Number(localidad), tipoUfId: 1, anioImplementacion: 2020, domicilio: 'Calle 1' })).json
  const pool = (await llamar('POST', '/api/pools-jueces', { provinciaId: 1, descripcion: `${P} pool`, totalJueces: 5 })).json
  await llamar('POST', `/api/organismos/${org.id}/unidades-funcionales/${uf.id}/asignaciones-jueces`, { grupoJuecesId: Number(pool.id), cantidadAsignada: 3 })
  const otroId = Number(psql(`SELECT id FROM usuarios WHERE email = '${OTRO}'`))
  await llamar('POST', `/api/organismos/${org.id}/editores`, { usuarioId: otroId })
  const preguntas = (await llamar('GET', '/api/taxonomia/preguntas?tipoOficinaId=1')).json
  await llamar('PUT', `/api/organismos/${org.id}/taxonomia`, { respuestas: [{ preguntaCodigo: preguntas[0].codigo, opcionesCodigos: [preguntas[0].opciones[0].codigo] }] })

  const usuarios = (await llamar('GET', '/api/usuarios')).json
  const anonimo = (u, i) => ({ ...u, email: `usuario-${i}@ejemplo.test`, nombre_display: u.nombre_display === null ? null : `Usuario ${i}` })
  const yo = usuarios.find((u) => u.email === EMAIL)

  const grabaciones = {
    sesion: (await llamar('GET', '/api/auth/session')).json,
    provincias: (await llamar('GET', '/api/provincias')).json,
    'denominaciones-simplificadas': (await llamar('GET', '/api/denominaciones-simplificadas')).json,
    'tipos-oficina': (await llamar('GET', '/api/tipos-oficina')).json,
    'tipos-uf': (await llamar('GET', '/api/tipos-uf')).json,
    fueros: (await llamar('GET', '/api/fueros')).json,
    localidades: (await llamar('GET', '/api/localidades')).json.slice(0, 5),
    'organismos-lista': (await llamar('GET', '/api/organismos')).json,
    'organismo-detalle': (await llamar('GET', `/api/organismos/${org.id}`)).json,
    fuero: (await llamar('GET', `/api/organismos/${org.id}/fuero`)).json,
    'unidades-lista': (await llamar('GET', `/api/organismos/${org.id}/unidades-funcionales`)).json,
    'unidad-detalle': (await llamar('GET', `/api/organismos/${org.id}/unidades-funcionales/${uf.id}`)).json,
    asignaciones: (await llamar('GET', `/api/organismos/${org.id}/unidades-funcionales/${uf.id}/asignaciones-jueces`)).json,
    // Las descripciones de pools reales identifican oficinas: se conserva la forma y se reemplazan.
    'pools-lista': (await llamar('GET', '/api/pools-jueces')).json.slice(0, 3).map((p, i) => ({ ...p, descripcion: `Pool de ejemplo ${i + 1}` })),
    editores: (await llamar('GET', `/api/organismos/${org.id}/editores`)).json,
    'taxonomia-catalogo': preguntas,
    'taxonomia-respuestas': (await llamar('GET', `/api/organismos/${org.id}/taxonomia`)).json,
    'usuarios-lista': usuarios.slice(0, 3).map(anonimo).concat([{ ...yo, email: 'fixture@ejemplo.test', nombre_display: 'Fixture' }]),
    'usuario-detalle': { ...(await llamar('GET', `/api/usuarios/${yo.id}`)).json, email: 'fixture@ejemplo.test' },
  }
  for (const [nombre, valor] of Object.entries(grabaciones)) guardar(nombre, valor)
  console.log('grabados:', Object.keys(grabaciones).length, 'archivos en', OUT)
} finally {
  limpiar()
  console.log('fixtures de prueba restantes:', psql(`SELECT count(*) FROM usuarios WHERE email LIKE '${P}%'`))
}
