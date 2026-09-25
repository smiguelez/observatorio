import { useMetodos } from '@/api/metodos'

export default function MetodosAcceso() {
  const { data, isPending, isError } = useMetodos()
  if (isPending) return <p className="text-sm text-muted-foreground">Cargando…</p>
  if (isError || !data) {
    return <p role="alert" className="text-sm text-destructive">No pudimos consultar tus métodos de acceso.</p>
  }
  return (
    <ul data-testid="metodos-acceso" className="flex flex-col gap-1 text-sm">
      <li data-metodo="contrasena" data-activo={data.contrasena}>
        Contraseña: {data.contrasena ? 'activa' : 'no configurada'}
      </li>
      <li data-metodo="google" data-activo={data.google}>
        Google: {data.google ? 'vinculado' : 'no vinculado'}
      </li>
      <li data-metodo="enlace" data-activo="true">Enlace por email: disponible con el email de tu cuenta</li>
    </ul>
  )
}
