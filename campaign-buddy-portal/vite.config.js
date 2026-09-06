import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Proxy avoids CORS pain while the backend is on a different port locally.
    // Point this at wherever the Unified Backend actually runs.
    proxy: {
      '/admin/v1': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
