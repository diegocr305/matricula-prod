import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import pkg from './package.json' with { type: 'json' }

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Inyecta la versión del package.json como constante global, disponible en
  // el frontend como __APP_VERSION__ (ver src/vite-env.d.ts).
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
})
