import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    // Dev: same-origin hacia el backend (research.md, Decisión 3). NO activar
    // `changeOrigin`: el puente Fastify->Better Auth arma la URL con el Host
    // recibido, que debe coincidir con el Origin del navegador (localhost:5173).
    proxy: {
      '/api': { target: 'http://localhost:3000' },
    },
  },
})
