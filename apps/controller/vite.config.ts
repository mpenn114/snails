import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { buildDevProxy, serverUrlFromEnv } from './src/dev-proxy';

/** Static art shared with the game content package (CC0 terrain textures, see its CREDITS.md). */
const assets = fileURLToPath(new URL('../../packages/content-base/assets', import.meta.url));

/** Vite config: Three.js (pulled in via the render package) gets its own cached chunk; LAN-visible dev server proxying to the game server. */
export default defineConfig({
  resolve: { alias: { '@assets': assets } },
  build: {
    // Safari 15 (iOS 15) is the floor; avoids shipping syntax it cannot parse.
    target: ['es2020', 'safari15'],
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
