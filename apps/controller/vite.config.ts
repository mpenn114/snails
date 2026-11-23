import { defineConfig } from 'vite';
import { contentAssets } from '../../scripts/vite-content-assets.mjs';
import { buildDevProxy, serverUrlFromEnv } from './src/dev-proxy';

/** Vite config: Three.js (pulled in via the render package) gets its own cached chunk; LAN-visible dev server proxying to the game server. */
export default defineConfig({
  plugins: [contentAssets()],
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
