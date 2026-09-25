import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.tsx'
import { ApiError } from '@/api/http'
import { marcarSesionVencida } from '@/auth/sesionVencida'
import { CLAVE_SESION } from '@/auth/useSesion'

// Un 401 en cualquier llamada => la sesión ya no es válida. Si había una sesión activa, se avisa con el
// diálogo de re-ingreso SIN desmontar la pantalla (para no perder lo que se estaba escribiendo — Edge Case
// de la spec); si no la había, las guardas redirigen a /login?returnTo=... (FR-020).
function alFallar(error: unknown) {
  if (error instanceof ApiError && error.status === 401) {
    if (queryClient.getQueryData(CLAVE_SESION)) marcarSesionVencida()
    else queryClient.setQueryData(CLAVE_SESION, null)
  }
}

const queryClient: QueryClient = new QueryClient({
  queryCache: new QueryCache({ onError: alFallar }),
  mutationCache: new MutationCache({ onError: alFallar }),
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
