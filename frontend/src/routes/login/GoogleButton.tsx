import { useState } from 'react'
import { authClient } from '@/api/auth-client'
import { Button } from '@/components/ui/button'
import { MENSAJE_INGRESO_GENERICO } from './mensajes'

export default function GoogleButton({ callbackURL }: { callbackURL: string }) {
  const [fallo, setFallo] = useState(false)
  const [cargando, setCargando] = useState(false)

  async function ingresar() {
    setFallo(false)
    setCargando(true)
    try {
      // callbackURL RELATIVO: Better Auth solo acepta relativos o de trustedOrigins.
      // El cliente navega solo a la URL de Google que devuelve el backend.
      const { error } = await authClient.signIn.social({
        provider: 'google',
        callbackURL,
        errorCallbackURL: '/login',
      })
      if (error) setFallo(true)
    } catch {
      setFallo(true)
    } finally {
      setCargando(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" variant="outline" onClick={ingresar} disabled={cargando}>
        Continuar con Google
      </Button>
      {fallo && (
        <p role="alert" className="text-sm text-destructive">
          {MENSAJE_INGRESO_GENERICO}
        </p>
      )}
    </div>
  )
}
