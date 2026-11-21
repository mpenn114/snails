import { defineConfig } from 'vite';
import { resolve } from 'node:path';

/** Vite config: ES-module workers (terrain mesher), dev proxy to the game server. */
export default defineConfig({
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        harness: resolve(__dirname, 'harness.html'),
      },
    },
  },
  worker: { format: 'es' },
  // Keep the render package unbundled in dev so its `new Worker(new URL(...))` resolves.
  optimizeDeps: { exclude: ['@snails/render'], esbuildOptions: { target: 'es2022' } },
  server: {
    proxy: {
      '/ws': { target: 'ws://localhost:3000', ws: true },
      '/api': { target: 'http://localhost:3000' },
    },
  },
});
