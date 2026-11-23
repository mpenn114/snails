import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MODELS_DIR = resolve(
  fileURLToPath(new URL('.', import.meta.url)),
  '../packages/content-base/assets/models',
);

/**
 * Vite plugin that publishes `packages/content-base/assets/models/*.glb` at `models/` of the
 * app (build output and dev server), so the render package can fetch them with a relative URL.
 * @returns a Vite plugin
 */
export function contentAssets() {
  const files = () => (existsSync(MODELS_DIR) ? readdirSync(MODELS_DIR) : []);
  return {
    name: 'snails-content-assets',
    configureServer(server) {
      server.middlewares.use('/models', (req, res, next) => {
        const name = decodeURIComponent((req.url ?? '').split('?')[0] ?? '').replace(/^\//, '');
        if (!files().includes(name)) return next();
        res.setHeader('Content-Type', 'model/gltf-binary');
        res.end(readFileSync(join(MODELS_DIR, name)));
      });
    },
    generateBundle() {
      for (const name of files()) {
        this.emitFile({
          type: 'asset',
          fileName: `models/${name}`,
          source: readFileSync(join(MODELS_DIR, name)),
        });
      }
    },
  };
}
