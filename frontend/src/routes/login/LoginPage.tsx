import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router'
import { esReturnToSeguro } from '@/auth/returnTo'
import { CLAVE_SESION, useSesion } from '@/auth/useSesion'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import GoogleButton from './GoogleButton'
import MagicLinkForm from './MagicLinkForm'
import { mensajeDeErrorEnUrl } from './mensajes'
import PasswordForm from './PasswordForm'

// No hay enlace ni pantalla de registro (FR-022, decisión 5).
export default function LoginPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { sesion } = useSesion()
  const [pestana, setPestana] = useState('contrasena')

  const returnTo = params.get('returnTo')
  const destino = esReturnToSeguro(returnTo) ? returnTo : '/organismos'
  const errorEnUrl = mensajeDeErrorEnUrl(params.get('error'))

  if (sesion) return <Navigate to={destino} replace />

  async function alIngresar() {
    await queryClient.invalidateQueries({ queryKey: CLAVE_SESION })
    navigate(destino, { replace: true })
  }

  return (
    <main className="mx-auto flex min-h-svh max-w-sm flex-col justify-center gap-6 p-4">
      <h1 className="text-2xl font-semibold">Observatorio de Oficinas Judiciales</h1>
      {errorEnUrl && (
        <div role="alert" data-testid="login-error-url" className="rounded-md border border-destructive/50 p-3 text-sm">
          {errorEnUrl}
        </div>
      )}
      <Tabs value={pestana} onValueChange={setPestana}>
        <TabsList className="w-full">
          <TabsTrigger value="contrasena">Con contraseña</TabsTrigger>
          <TabsTrigger value="enlace">Con enlace por email</TabsTrigger>
        </TabsList>
        <TabsContent value="contrasena" className="pt-4">
          <PasswordForm callbackURL={destino} alExito={alIngresar} alElegirOtroMetodo={() => setPestana('enlace')} />
        </TabsContent>
        <TabsContent value="enlace" className="pt-4">
          <MagicLinkForm callbackURL={destino} />
        </TabsContent>
      </Tabs>
      <Separator />
      <GoogleButton callbackURL={destino} />
    </main>
  )
}
