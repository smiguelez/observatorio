import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import tailwindcss from 'tailwindcss';  // Importar tailwindcss
import autoprefixer from 'autoprefixer'; // Importar autoprefixer

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  css: {
    postcss: {
      plugins: [
        tailwindcss(),  // Usar tailwindcss como plugin
        autoprefixer(),  // Usar autoprefixer como plugin
      ],
    },
  },
});
