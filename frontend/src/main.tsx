import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.tsx'
import { ApiError } from '@/api/http'
import { CLAVE_SESION } from '@/auth/useSesion'

// Un 401 en cualquier llamada => la sesión ya no es válida: se descarta y las
// guardas redirigen a /login?returnTo=... (FR-020, Edge Case de sesión vencida).
function alFallar(error: unknown) {
  if (error instanceof ApiError && error.status === 401) {
    queryClient.setQueryData(CLAVE_SESION, null)
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
