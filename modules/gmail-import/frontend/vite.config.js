import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

// API-ul PHP rulează sub Apache (XAMPP). Setează VITE_API_TARGET dacă alias-ul e altul.
const target = process.env.VITE_API_TARGET || 'http://localhost/pago';

export default defineConfig({
  plugins: [tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target, changeOrigin: true },
    },
  },
});
