import { Link } from 'react-router'

export default function NoEncontrado() {
  return (
    <div className="mx-auto max-w-md p-8 text-center">
      <h1 className="text-xl font-semibold">Página no encontrada</h1>
      <p className="mt-2 text-muted-foreground">La página que buscás no existe.</p>
      <Link className="mt-4 inline-block underline" to="/organismos">
        Volver a mis organismos
      </Link>
    </div>
  )
}
