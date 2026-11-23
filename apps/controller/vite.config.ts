import { defineConfig } from 'vite';

/** Vite config: Three.js (pulled in via the render package) gets its own cached chunk. */
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) => (id.includes('node_modules/three/') ? 'three' : undefined),
      },
    },
  },
});
