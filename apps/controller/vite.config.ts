import { defineConfig } from 'vite';
import { buildDevProxy, serverUrlFromEnv } from './src/dev-proxy';

/** Vite config: Three.js (pulled in via the render package) gets its own cached chunk; LAN-visible dev server proxying to the game server. */
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) => (id.includes('node_modules/three/') ? 'three' : undefined),
      },
    },
  },
  server: {
    // Listen on the LAN so phones can reach the dev server.
    host: true,
    proxy: buildDevProxy(serverUrlFromEnv(process.env)),
  },
});
