import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Vite busca postcss.config.js hacia arriba del árbol de directorios y
  // encuentra el de la SPA en la raíz del monorepo (usa tailwindcss, no
  // instalado acá). `css.postcss: {}` fuerza una config inline vacía y
  // corta esa búsqueda — este backend no procesa CSS.
  css: { postcss: {} },
  test: {
    root: import.meta.dirname,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
