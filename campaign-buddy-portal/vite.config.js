/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url)));

export default defineConfig({
  plugins: [react()],
  define: {
    // Stamped into issue reports so we know which portal build a bug came from.
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  test: {
    include: ['src/**/*.test.{js,jsx}'],
    environment: 'node',
  },
  server: {
    port: 5173,
    // Proxy avoids CORS pain while the backend is on a different port locally.
    // Point this at wherever the Unified Backend actually runs.
    proxy: {
      '/admin/v1': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:4000',
        changeOrigin: true,
      },
      // Uploaded product photos (see catalog.routes.ts POST /items/:id/image)
      // are served by the backend at this same path — proxy it too so
      // <img src="/uploads/..."> resolves in dev the same way it will in
      // production behind a shared reverse proxy.
      '/uploads': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
