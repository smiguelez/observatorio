// Punto de entrada de los ajustes de la aplicación (FR-013). En esta primera versión no hay
// configuración concreta que ofrecer (Assumptions de la spec): es un lugar reservado.
export default function AjustesPage() {
  return (
    <section className="max-w-xl">
      <h1 className="text-xl font-semibold">Ajustes</h1>
      <p data-testid="ajustes-vacio" className="mt-2 text-muted-foreground">
        Todavía no hay opciones de configuración disponibles. Cuando las haya, van a aparecer acá.
      </p>
    </section>
  )
}
