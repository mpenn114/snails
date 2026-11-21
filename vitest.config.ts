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
      '@snails/render': src('render'),
    },
  },
  test: {
    include: ['{apps,packages}/*/src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['packages/core/src/**/*.ts'],
      exclude: [
        '**/*.test.ts',
        'packages/core/src/properties/**',
        'packages/core/src/index.ts',
        '**/types.ts',
      ],
      reporter: ['text-summary', 'json-summary'],
      thresholds: { lines: 90 },
    },
  },
});
