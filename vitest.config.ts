import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const src = (name: string): string =>
  fileURLToPath(new URL(`./packages/${name}/src/index.ts`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@snails/core': src('core'),
      '@snails/protocol': src('protocol'),
      '@snails/content-base': src('content-base'),
      '@snails/ai': src('ai'),
    },
  },
  test: { include: ['{apps,packages}/*/src/**/*.test.ts'] },
});
