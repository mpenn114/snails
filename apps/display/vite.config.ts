import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { buildDevProxy, serverUrlFromEnv } from './src/dev-proxy';

/** Vite config: ES-module workers (terrain mesher), dev proxy to the game server. */
export default defineConfig({
  build: {
    target: 'es2022',
    // The three chunk is ~505 kB minified on its own (126 kB gzip) and is cached separately.
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // Three.js is large and rarely changes: its own long-cached chunk.
        manualChunks: (id) => (id.includes('node_modules/three/') ? 'three' : undefined),
      },
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
    proxy: buildDevProxy(serverUrlFromEnv(process.env)),
  },
});
