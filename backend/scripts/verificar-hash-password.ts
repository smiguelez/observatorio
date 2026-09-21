// T041 (Polish): verifica CONTRA LA BASE, no solo contra el código, qué
// algoritmo quedó usado en auth.account.password para un usuario de
// contraseña real (SC-008, Principio IV). Crea un usuario de prueba real
// (mismo flujo que un cliente real, auth.api.signUpEmail), inspecciona el
// valor crudo almacenado, y lo borra al final.
import { auth } from '../src/auth/index.js'
import { getPgPool, closePgPool } from '../src/db/pool.js'

const EMAIL_PRUEBA = 'verificacion-hash@example.observatorio.test'

async function main() {
  const pool = getPgPool()

  const signUp = await auth.api.signUpEmail({
    body: { email: EMAIL_PRUEBA, password: 'contrasena-de-verificacion-12345', name: 'Verificación de hash' },
  })
  console.log('[verificar-hash] Usuario creado:', signUp.user.id)

  const { rows } = await pool.query<{ password: string | null; providerId: string }>(
    'SELECT password, "providerId" FROM auth.account WHERE "userId" = $1',
    [signUp.user.id],
  )

  if (rows.length === 0) {
    console.error('[verificar-hash] ERROR: no se encontró ninguna fila en auth.account para este usuario.')
    process.exitCode = 1
  } else {
    const fila = rows[0]!
    const hash = fila.password ?? ''
    const esTextoPlano = hash === 'contrasena-de-verificacion-12345'
    const partes = hash.split(':')
    const pareceScrypt = partes.length === 2 && partes[0]!.length > 0 && partes[1]!.length > 0

    console.log('[verificar-hash] providerId:', fila.providerId)
    console.log('[verificar-hash] Longitud del valor almacenado:', hash.length, 'caracteres')
    console.log('[verificar-hash] Primeros 20 caracteres:', hash.slice(0, 20) + '...')
    console.log('[verificar-hash] ¿Es la contraseña en texto plano?', esTextoPlano)
    console.log('[verificar-hash] ¿Tiene forma {salt}:{key} (scrypt de Better Auth)?', pareceScrypt)
    console.log('[verificar-hash] Segmento salt (primeros 16 chars):', partes[0]?.slice(0, 16))
    console.log('[verificar-hash] Longitud del segmento key:', partes[1]?.length)

    if (esTextoPlano) {
      console.error('[verificar-hash] RESULTADO: FALLO — la contraseña está en texto plano.')
      process.exitCode = 1
    } else if (!pareceScrypt) {
      console.error('[verificar-hash] RESULTADO: el formato no es el esperado ({salt}:{key}) — revisar manualmente.')
      process.exitCode = 1
    } else {
      console.log('[verificar-hash] RESULTADO: OK — hash con salt, no texto plano, formato scrypt.')
    }
  }

  await pool.query('DELETE FROM auth.session WHERE "userId" = $1', [signUp.user.id])
  await pool.query('DELETE FROM auth.account WHERE "userId" = $1', [signUp.user.id])
  await pool.query('DELETE FROM auth."user" WHERE id = $1', [signUp.user.id])
  await pool.query('DELETE FROM usuarios WHERE email = $1', [EMAIL_PRUEBA])
  console.log('[verificar-hash] Limpieza: usuario de prueba eliminado.')

  await closePgPool()
}

main().catch((err) => {
  console.error('[verificar-hash] ERROR:', err)
  process.exitCode = 1
})
