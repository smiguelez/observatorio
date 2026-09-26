import { z } from 'zod'
import { ApiError } from '@/api/http'

// 008 (D18/007): un rechazo del PUT de taxonomía que identifica una pregunta trae `preguntaCodigo` y `preguntaTexto` como datos
// PROPIOS (`400 { error, preguntaCodigo, preguntaTexto }`). El cliente usa ese campo y NO busca el código dentro del texto del
// mensaje (lo que "funcionaba" solo por coincidencia con los «» del texto). Un rechazo sin pregunta (p. ej. "Pregunta(s)
// inexistente(s): …") no trae el campo: entonces no se resalta nada y solo se muestra el mensaje.
const CuerpoConPregunta = z.object({ preguntaCodigo: z.string().min(1) })

/** Código de la pregunta que el servidor señala, o `null` si el error no la identifica. Nunca lanza. */
export function preguntaDelError(e: unknown): string | null {
  if (!(e instanceof ApiError) || e.status !== 400) return null
  const r = CuerpoConPregunta.safeParse(e.cuerpo)
  return r.success ? r.data.preguntaCodigo : null
}
