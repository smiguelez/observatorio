// Config de Vite para ejecutar la SPA VIEJA (copia de `src/` de la raíz, sin modificar) con Firebase
// reemplazado por stubs en memoria con datos sintéticos. La usa `run.sh` dentro de un directorio temporal.
import path from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from 'tailwindcss'
import autoprefixer from 'autoprefixer'
import { defineConfig } from 'vite'

const stubs = process.env.STUBS_DIR
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: 'firebase/app', replacement: path.join(stubs, 'firebase-app.js') },
      { find: 'firebase/auth', replacement: path.join(stubs, 'firebase-auth.js') },
      { find: 'firebase/firestore', replacement: path.join(stubs, 'firebase-firestore.js') },
      { find: 'react-firebase-hooks/auth', replacement: path.join(stubs, 'react-firebase-hooks-auth.js') },
      { find: '@', replacement: path.resolve(import.meta.dirname, './src') },
    ],
  },
  css: { postcss: { plugins: [tailwindcss(), autoprefixer()] } },
  server: { port: 5180 },
})
