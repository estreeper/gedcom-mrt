/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The backend (Fastify) serves the SPA and the API under the same origin in
// production, so the client always calls relative `/api` paths. In dev the app
// and the API run on separate ports, so proxy `/api` to the local backend to
// keep the same-origin, relative-path contract (no env divergence, no CORS).
const API_TARGET = process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:8080';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true },
    },
  },
  build: {
    // Matches the previous CRA output dir so Docker/serving config is stable.
    outDir: 'build',
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts'],
    css: false,
    // The backend has its own Vitest project (node env); don't run it here.
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/**/__fixtures__/**', 'src/setupTests.ts', 'src/test/**', 'src/vite-env.d.ts'],
      reporter: ['text', 'html'],
    },
  },
});
