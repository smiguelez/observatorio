import { createAuthClient } from 'better-auth/client'
import { magicLinkClient } from 'better-auth/client/plugins'

// Sin `baseURL`: rutas relativas, mismo origen (proxy de Vite en dev).
export const authClient = createAuthClient({
  plugins: [magicLinkClient()],
})
