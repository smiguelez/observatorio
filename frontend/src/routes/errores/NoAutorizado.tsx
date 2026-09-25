import { Link } from 'react-router'

export default function NoAutorizado() {
  return (
    <div role="alert" className="mx-auto max-w-md p-8 text-center">
      <h1 className="text-xl font-semibold">No autorizado</h1>
      <p className="mt-2 text-muted-foreground">No tenés permiso para ver o modificar este recurso.</p>
      <Link className="mt-4 inline-block underline" to="/organismos">
        Volver a mis organismos
      </Link>
    </div>
  )
}
