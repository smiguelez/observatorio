// Graba respuestas REALES del backend en tests/unit/api/fixtures/real/*.json (base de la suite de contrato
// de la capa de mapeo, D13). Uso (backend corriendo con BETTER_AUTH_URL=http://localhost:5173):
//   DATABASE_URL=... node scripts/grabar-fixtures.mjs           # solo los fixtures de 007 (Fase B)
//   DATABASE_URL=... node scripts/grabar-fixtures.mjs --todos   # además regraba los de 005 (pisa los existentes)
// Desde 007 no existe el alta pública por contraseña: los usuarios se dan de alta por el flujo administrado
// (alta + canje). El ÚNICO arranque por SQL es el admin de fixtures (mismo criterio que tests/e2e/helpers/backend.ts).
// Crea usuarios/organismos con prefijo `test-frontend-` y los BORRA al terminar. Los datos de usuarios
// reales NO se graban: en /api/usuarios se conserva la forma pero se reemplazan email y nombre (PII), y en
// /api/pools-jueces las descripciones (identifican oficinas).
import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
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
    `DELETE FROM auth.verification WHERE identifier LIKE 'reset-password:%' AND value IN (SELECT id::text FROM usuarios WHERE email LIKE '${P}%')`,
    `DELETE FROM auth.session WHERE "userId" IN (SELECT id::text FROM usuarios WHERE email LIKE '${P}%')`,
    `DELETE FROM auth.account WHERE "userId" IN (SELECT id::text FROM usuarios WHERE email LIKE '${P}%')`,
    `DELETE FROM auth."user" WHERE email LIKE '${P}%'`,
    `DELETE FROM usuarios WHERE email LIKE '${P}%'`,
    `DELETE FROM grupos_jueces WHERE descripcion LIKE '${P}%'`,
  ]) psql(q)
}

const JSON_H = { 'content-type': 'application/json', origin: ORIGEN }
const cookieDe = (r) => r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ')
const canjear = (token, password) => fetch(`${BACKEND}/api/acceso-inicial/canjear`, { method: 'POST', headers: JSON_H, body: JSON.stringify({ token, password }) })

/** Admin de fixtures: única fila creada por SQL; se canjea su acceso por HTTP y se devuelve su cookie. */
async function arrancarAdmin() {
  const email = `${P}-boot@example.test`
  const id = psql(`INSERT INTO usuarios (email, email_verificado, firestore_id) VALUES ('${email}', true, 'api:${P}-boot') RETURNING id`).split('\n')[0]
  psql(`INSERT INTO usuario_roles (usuario_id, rol_id) SELECT ${id}, id FROM roles WHERE nombre IN ('admin','usuario_normal')`)
  psql(`INSERT INTO auth."user" (id, name, email, "emailVerified") VALUES ('${id}', 'fixtures', '${email}', true)`)
  const token = randomBytes(24).toString('base64url')
  psql(`INSERT INTO auth.verification (id, identifier, value, "expiresAt") VALUES ('boot-${token.slice(0, 12)}', 'reset-password:${token}', '${id}', now() + interval '1 hour')`)
  const c = await canjear(token, CLAVE)
  if (!c.ok) throw new Error(`canje de arranque ${c.status}`)
  return cookieDe(c)
}

/** Alta administrada + canje: devuelve { cookie, alta } (cookie de la persona canjeada). */
async function altaYCanje(email, cookieAdmin, provinciaId = 1) {
  const r = await fetch(`${BACKEND}/api/usuarios`, { method: 'POST', headers: { ...JSON_H, cookie: cookieAdmin }, body: JSON.stringify({ email, rol: 'usuario_normal', provinciaId }) })
  if (r.status !== 201) throw new Error(`alta ${r.status} ${await r.text()}`)
  const alta = await r.json()
  const c = await canjear(alta.accesoInicial.token, CLAVE)
  if (!c.ok) throw new Error(`canje ${c.status}`)
  return { cookie: cookieDe(c), alta }
}

limpiar()
mkdirSync(OUT, { recursive: true })
try {
  const cookieAdmin = await arrancarAdmin()
  const { cookie } = await altaYCanje(EMAIL, cookieAdmin, 1)
  await altaYCanje(OTRO, cookieAdmin, 1)
  psql(`UPDATE usuarios SET nombre_display = 'Fixture' WHERE email = '${EMAIL}'`)
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
  // ---- 007 (Fase B): alta administrada, acceso inicial, canje, rol y rechazos ----------------------------------------
  // Las formas son literales; los TOKENS se redactan (nunca se graba un acceso ni una cookie real).
  const REDACTADO = 'TOKEN-REDACTADO'
  const redactar = (o) => JSON.parse(JSON.stringify(o, (k, v) => (k === 'token' ? REDACTADO : v)))
  const admin = async (metodo, ruta, cuerpo) => {
    const r = await fetch(`${BACKEND}${ruta}`, { method: metodo, headers: cuerpo === undefined ? { cookie: cookieAdmin, origin: ORIGEN } : { ...JSON_H, cookie: cookieAdmin }, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) })
    const t = await r.text()
    return { status: r.status, json: t ? JSON.parse(t) : null }
  }
  const NUEVO = `${P}-alta@example.test`
  const alta = await admin('POST', '/api/usuarios', { email: NUEVO, rol: 'usuario_normal', provinciaId: 3 })
  const reemitido = await admin('POST', `/api/usuarios/${alta.json.id}/acceso-inicial`)
  const canje = await canjear(reemitido.json.token, CLAVE)
  const canjeJson = await canje.json()
  const rolCambiado = await admin('PUT', `/api/usuarios/${alta.json.id}/rol`, { rol: 'admin' })
  const altaAdmin = await admin('POST', '/api/usuarios', { email: `${P}-alta-admin@example.test`, rol: 'admin' })
  const canjeInvalido = await canjear('token-que-no-existe', CLAVE)
  const canjeCorto = await canjear('token-que-no-existe', 'corta')
  const dup = await admin('POST', '/api/usuarios', { email: NUEVO.toUpperCase(), rol: 'admin' })
  const validacion = await admin('POST', '/api/usuarios', { email: `${P}-x@example.test` }) // falta `rol`
  const poolEnUso = await llamar('DELETE', `/api/pools-jueces/${pool.id}`) // el pool tiene una asignación
  const orgOperativa = (await llamar('POST', '/api/organismos', { denominacion: `${P} operativa`, denominacionSimplificadaId: 1, tipoOficinaId: 4, provinciaId: 1 })).json
  const taxError = await llamar('PUT', `/api/organismos/${orgOperativa.id}/taxonomia`, { respuestas: [{ preguntaCodigo: preguntas[0].codigo, opcionesCodigos: [preguntas[0].opciones[0].codigo] }] })
  const nuevas = {
    'usuario-alta': redactar(alta.json),
    'usuario-alta-admin': redactar(altaAdmin.json),
    'acceso-reemitido': redactar(reemitido.json),
    canje: canjeJson,
    rol: rolCambiado.json,
    'error-alta-duplicado': dup.json,
    'error-canje-invalido': await canjeInvalido.json(),
    'error-canje-password-corta': await canjeCorto.json(),
    'error-validacion-fastify': validacion.json,
    'error-pool-en-uso': poolEnUso.json,
    'error-taxonomia-pregunta': taxError.json,
  }
  const estados = { alta: alta.status, reemitido: reemitido.status, canje: canje.status, rol: rolCambiado.status, dup: dup.status, canjeInvalido: canjeInvalido.status, canjeCorto: canjeCorto.status, validacion: validacion.status, poolEnUso: poolEnUso.status, taxError: taxError.status }
  console.log('estados HTTP de las capturas de 007:', JSON.stringify(estados))
  const esperados = { alta: 201, reemitido: 201, canje: 200, rol: 200, dup: 400, canjeInvalido: 400, canjeCorto: 400, validacion: 400, poolEnUso: 400, taxError: 400 }
  for (const [k, v] of Object.entries(esperados)) if (estados[k] !== v) throw new Error(`captura ${k}: esperaba ${v}, llegó ${estados[k]}`)
  const aGrabar = process.argv.includes('--todos') ? { ...grabaciones, ...nuevas } : nuevas
  for (const [nombre, valor] of Object.entries(aGrabar)) guardar(nombre, valor)
  console.log('grabados:', Object.keys(aGrabar).length, 'archivos en', OUT)
} finally {
  limpiar()
  console.log('fixtures de prueba restantes:', psql(`SELECT count(*) FROM usuarios WHERE email LIKE '${P}%'`))
}
