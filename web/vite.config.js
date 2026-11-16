import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// /api/* din frontend -> http://localhost/pago/api/* (Apache din XAMPP).
// Dacă repo-ul e în alt folder din htdocs, schimbă API_PREFIX (ex: API_PREFIX=/alt-folder npm run dev).
const API_TARGET = process.env.API_TARGET || 'http://localhost'
const API_PREFIX = process.env.API_PREFIX ?? '/pago'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      // Modulul Gmail (import furnizori) are backend-ul propriu, în modules/gmail-import/backend/public.
      // Regulile sunt înaintea lui '/api', care merge la api/ (restul platformei).
      ...Object.fromEntries(
        ['/api/auth', '/api/scan', '/api/providers'].map((prefix) => [
          prefix,
          {
            target: API_TARGET,
            changeOrigin: true,
            rewrite: (path) => `${API_PREFIX}/modules/gmail-import/backend/public${path}`,
          },
        ]),
      ),
      '/api': {
        target: API_TARGET,
        changeOrigin: true,
        rewrite: (path) => API_PREFIX + path,
      },
    },
  },
})
