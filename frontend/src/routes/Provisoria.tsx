// Pantalla provisoria: cada historia reemplaza la suya. Existe para que el
// router de T020 tenga TODAS las rutas de contracts/routes.md desde el inicio.
export default function Provisoria({ titulo }: { titulo: string }) {
  return (
    <section>
      <h1 className="text-xl font-semibold">{titulo}</h1>
      <p className="text-muted-foreground">Pantalla pendiente de implementar.</p>
    </section>
  )
}
