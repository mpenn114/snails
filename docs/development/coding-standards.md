# Coding standards

## Hard limits

| Limit | Value | Enforced by |
| --- | --- | --- |
| Lines per file | 500 | ESLint `max-lines` (skip blank/comments off: counts all lines) + `scripts/check-limits.mjs` |
| Lines per function | 60 | ESLint `max-lines-per-function` + `scripts/check-limits.mjs` |
| `any` | forbidden | `@typescript-eslint/no-explicit-any: error` |
| Exported API without TSDoc | forbidden | `eslint-plugin-jsdoc` (`require-jsdoc`/`require-description` on exports, error for public API) |

### How limits are enforced

- **ESLint** runs per package in `pnpm lint` and in the editor, giving immediate feedback:
  `max-lines: ['error', { max: 500 }]`, `max-lines-per-function: ['error', { max: 60, skipBlankLines: false, skipComments: false }]`.
- **`scripts/check-limits.mjs`** is a dependency-free Node script run in CI (`pnpm check-limits`). It walks `apps/*/src`, `packages/*/src` and `scripts`, parses `.ts/.tsx/.mjs` files, and fails with a list of `path:line  N lines (max M)` for any file over 500 lines or function over 60 lines. It exists so the limit holds even if a lint rule is disabled or an override slips in, and it rejects `eslint-disable` comments targeting `max-lines*` unless the file is on the allow-list `scripts/limits-allowlist.json` (generated code only, each entry needs a reason).
- CI order: install (frozen lockfile) -> lint -> typecheck -> check-limits -> test -> build.
- When a limit is hit, split by responsibility (extract helpers, a sub-module, a table), do not compress code to dodge the count.

## TypeScript

- `strict: true`, plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `verbatimModuleSyntax`.
- No `any`; use `unknown` and narrow with zod or type guards. No non-null assertions outside tests. `@ts-expect-error` needs a reason comment.
- Prefer `type` for unions/data and `interface` for implementable contracts. Use discriminated unions for messages and events. Prefer `readonly` and immutable data crossing package boundaries.
- Validate all external input (network, files, content packs) with zod at the boundary; inside, trust types.
- Errors: throw `Error` subclasses with stable `code`; never throw strings. Sim code returns results/events instead of throwing for gameplay conditions.
- `@snails/core`: no DOM or Node imports, no `Math.random`, `Date.now`, `performance.now`, no iteration over `Set`/`Map` of unstable order for sim-affecting logic (use ordered arrays or sort by id).

## TSDoc

All exported functions, classes, types and constants carry TSDoc:

```ts
/**
 * Carves a sphere out of the terrain field and marks touched chunks dirty.
 *
 * @param field - Terrain to mutate.
 * @param centre - World-space centre of the blast.
 * @param radius - Blast radius in metres; must be > 0.
 * @returns Ids of chunks whose geometry must be rebuilt.
 */
export function carveSphere(field: TerrainField, centre: Vec3, radius: number): ChunkId[] {}
```

Explain intent, units and invariants, not the obvious. Internal helpers need comments only where logic is non-obvious.

## Naming

| Thing | Convention | Example |
| --- | --- | --- |
| Files | `kebab-case.ts`; one main export per file; tests `*.test.ts` | `turn-manager.ts` |
| Types, classes, interfaces | `PascalCase` (no `I` prefix) | `TurnManager` |
| Functions, variables | `camelCase`, verbs for functions | `applyDamage` |
| Constants | `SCREAMING_SNAKE_CASE` for true constants | `FIXED_DT` |
| Content ids | `pack:kebab-name` | `base:bazooka` |
| Protocol message types | `domain.action` | `intent.fire` |
| Units | in names when ambiguous | `radiusMetres`, `delayMs` |
| Packages | `@snails/<dir>` | `@snails/core` |

World units: metres, seconds, radians internally (degrees only in UI/content, converted at the boundary). Coordinates: right-handed, +Y up, as in Three.js.

## Folder conventions

```
packages/core/
  src/
    index.ts            # public API only; everything else is internal
    sim/  terrain/  turn/  research/  events/  content/  rng/
    <area>/index.ts     # area barrel optional; no deep imports across packages
  test/                 # integration/determinism tests (unit tests colocated)
  package.json  tsconfig.json
apps/<app>/src/         # entry (main.ts), features/, ui/, net/
```

- Import other packages only through their package entry (`@snails/core`), never `../../core/src/...`.
- Dependency direction is fixed (see [architecture.md](../architecture.md)) and enforced with `no-restricted-imports`.
- Avoid circular imports (`import/no-cycle`).
- Keep `src/index.ts` of each package as a curated export list; adding an export is an API decision.

## Render boundary (render owns no game rules)

`packages/render` (`@snails/render`) and `apps/display` only *draw* state; they never run or mutate the simulation. Enforced by `eslint.config.js` (`no-restricted-imports` / `no-restricted-syntax` on `packages/render/src/**` and `apps/display/src/**`) and by `packages/render/src/architecture.test.ts`. Both read the same list in `scripts/render-boundary.json`.

- Allowed from `@snails/core`: the package root only, for types, snapshot shapes, `SdfGrid` reads, constants (`FIXED_DT`, `SNAIL_RADIUS`, ...) and pure helpers (`facingVector`, `findSnail`, `createSnapshot`).
- Forbidden: deep `@snails/core/*` or `../core/src` paths; a namespace import of `@snails/core`; the mutating names listed in `forbiddenCoreNames` (e.g. `Simulation`, `createMatch`, `carveSphere`, `resolveCollapse`, `applyDamage`, `movementSystem`, `registerCombat`); calls to `.step`, `.submit`, `.enqueue`, `.registerCommandHandler`, `.addSystem`.
- Forbidden packages and paths: `@snails/ai`, `@snails/content-base`, `@snails/server`, `@snails/controller`, `@snails/desktop`, and their deep paths.
- Forbidden: Node built-ins (`node:*`, `fs`, `path`, ...). Test files (`*.test.ts`) may use them; the architecture test scans sources with `node:fs`.
- Adding a name to a forbidden list or a new allowed read-only export is a boundary decision: update `scripts/render-boundary.json` and the rule's rationale here.

## Style and process

- Prettier is the formatter (no style debates); run on save and in `pnpm format:check`.
- Conventional commits: `feat(core): add bouncing projectile`, `fix(server): ...`, `docs:`, `chore:`. Scope = package directory name.
- PRs: small, one concern, tests included, docs updated when behaviour or protocol changes (and an ADR for architectural decisions).
- No TODOs without an issue reference (`TODO(#123)`).
