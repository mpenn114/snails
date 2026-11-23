import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import jsdoc from 'eslint-plugin-jsdoc';
import globals from 'globals';
import { readFileSync } from 'node:fs';
import { builtinModules } from 'node:module';

const boundary = JSON.parse(
  readFileSync(new URL('./scripts/render-boundary.json', import.meta.url), 'utf8'),
);

const RENDER_FILES = ['packages/render/src/**/*.ts', 'apps/display/src/**/*.ts'];
const RENDER_TEST_FILES = ['packages/render/src/**/*.test.ts', 'apps/display/src/**/*.test.ts'];

/**
 * Builds the `no-restricted-imports` options that keep render/display free of
 * game-rule, AI, content, server and Node-builtin dependencies.
 *
 * @param withBuiltins - Also forbid Node built-ins (off for tests, which may use node:fs).
 * @param allowCoreDriving - Permit core's sim-driving names (the local fake-server harness only).
 * @returns Rule options for `no-restricted-imports`.
 */
function renderImportRestrictions(withBuiltins, allowCoreDriving = false) {
  const packageMessage =
    'render/display must not depend on this package (see docs/development/coding-standards.md).';
  // Tests (withBuiltins false) may import core's mutating functions to compare against them.
  const corePath = {
    name: '@snails/core',
    importNames: boundary.forbiddenCoreNames,
    message:
      'Render/display may only read @snails/core. This name mutates or drives the simulation.',
  };
  const paths = [
    ...(withBuiltins && !allowCoreDriving ? [corePath] : []),
    ...boundary.forbiddenPackages.map((name) => ({ name, message: packageMessage })),
  ];
  if (withBuiltins) {
    paths.push(
      ...builtinModules.map((name) => ({
        name,
        message: 'Node built-ins are not allowed in render/display.',
      })),
    );
  }
  return [
    'error',
    {
      paths,
      patterns: [
        {
          group: ['@snails/core/*', '**/core/src/**', '**/core/dist/**'],
          message: 'Import @snails/core only through its package root.',
        },
        {
          group: [
            ...boundary.forbiddenPackages.flatMap((name) => [`${name}/*`]),
            ...boundary.forbiddenPathSegments.map((seg) => `**/${seg}/**`),
          ],
          message: packageMessage,
        },
        ...(withBuiltins
          ? [{ group: ['node:*'], message: 'Node built-ins are not allowed in render/display.' }]
          : []),
      ],
    },
  ];
}

const FORBIDDEN_SYNTAX = [
  {
    selector: "ImportDeclaration[source.value='@snails/core'] > ImportNamespaceSpecifier",
    message:
      'Namespace imports of @snails/core are not allowed in render/display; import named read-only exports.',
  },
  {
    selector:
      "CallExpression[callee.type='MemberExpression'][callee.property.name=/^(step|submit|enqueue|registerCommandHandler|addSystem)$/]",
    message:
      'Render/display must not drive the simulation (step/submit/enqueue/handler registration).',
  },
];

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/release/**',
      'docs/**',
      'pnpm-lock.yaml',
      '.claude/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      'max-lines': ['error', { max: 500, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['error', { max: 60, skipBlankLines: true, skipComments: true }],
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    files: ['**/src/**/*.ts'],
    ignores: ['**/*.test.ts'],
    plugins: { jsdoc },
    rules: {
      'jsdoc/require-jsdoc': [
        'error',
        {
          publicOnly: true,
          require: { FunctionDeclaration: true, ClassDeclaration: true, MethodDefinition: false },
        },
      ],
    },
  },
  {
    files: ['**/*.test.ts'],
    rules: { 'max-lines-per-function': 'off' },
  },
  {
    // Render owns no game rules: read-only access to @snails/core, no AI/content/server, no Node built-ins.
    files: RENDER_FILES,
    rules: {
      'no-restricted-imports': renderImportRestrictions(true),
      'no-restricted-syntax': ['error', ...FORBIDDEN_SYNTAX],
    },
  },
  {
    // The local harness stands in for the game server (creates and steps a sim in the browser to
    // feed the renderer; match/terrain-init.ts regenerates the seeded terrain). Only these may use core's driving API; packages/Node built-ins stay banned.
    files: ['apps/display/src/harness/**/*.ts', 'apps/display/src/match/terrain-init.ts'],
    rules: {
      'no-restricted-imports': renderImportRestrictions(true, true),
      'no-restricted-syntax': [
        'error',
        {
          selector: "ImportDeclaration[source.value='@snails/core'] > ImportNamespaceSpecifier",
          message: 'Namespace imports of @snails/core are not allowed; import named exports.',
        },
      ],
    },
  },
  {
    // Tests may use node:fs to scan sources (architecture.test.ts); other boundaries still apply.
    files: RENDER_TEST_FILES,
    rules: { 'no-restricted-imports': renderImportRestrictions(false) },
  },
);
