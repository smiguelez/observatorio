import { defineConfig } from '@playwright/test'

// E2E contra el backend real (sin mocks del backend). Requiere backend en
// :3000 con BETTER_AUTH_URL=http://localhost:5173 (ver quickstart.md).
export default defineConfig({
  // Un solo worker: los fixtures test-frontend-* comparten una base real.
  workers: 1,
  fullyParallel: false,
  testDir: './tests/e2e',
  use: { baseURL: 'http://localhost:5173' },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
  },
})
