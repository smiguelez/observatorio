import { useParams } from 'react-router'
import { useOrganismo } from '@/api/organismos'
import { useCatalogoTaxonomia, useRespuestasTaxonomia } from '@/api/taxonomia'
import { Skeleton } from '@/components/ui/skeleton'
import TaxonomiaForm from '@/features/taxonomia/TaxonomiaForm'

export default function TaxonomiaTab() {
  const orgId = Number(useParams().id)
  const { data: organismo } = useOrganismo(orgId)
  const catalogo = useCatalogoTaxonomia(organismo?.tipoOficinaId)
  // FR-023: si el tipo no tiene preguntas aplicables NO se piden las respuestas ni se arma formulario.
  const sinTaxonomia = catalogo.data?.length === 0
  const respuestas = useRespuestasTaxonomia(orgId, catalogo.data !== undefined && !sinTaxonomia)

  if (catalogo.isError || respuestas.isError) {
    return (
      <div role="alert" className="rounded-md border border-destructive/50 p-3 text-sm">
        No pudimos cargar la taxonomía de este organismo.
      </div>
    )
  }
  if (catalogo.isPending || (!sinTaxonomia && respuestas.isPending)) return <Skeleton className="h-40 w-full" />
  if (sinTaxonomia) {
    return (
      <p data-testid="sin-taxonomia" className="rounded-md border p-4 text-sm">
        Este tipo de organismo no tiene taxonomía: no hay preguntas para responder.
      </p>
    )
  }
  // `key` fuerza un formulario nuevo si cambia el conjunto de preguntas (p. ej. cambió el tipo).
  return <TaxonomiaForm key={catalogo.data!.map((p) => p.codigo).join('|')} orgId={orgId} catalogo={catalogo.data!} respuestas={respuestas.data!} />
}
