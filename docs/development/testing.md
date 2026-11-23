# Testing

Runner: **Vitest** across all packages (`pnpm test`, `pnpm -F @snails/core test --watch`). Tests are colocated as `*.test.ts` or in a package `test/` directory for integration scenarios.

## Pyramid

| Layer | Tool | Where | Notes |
| --- | --- | --- | --- |
| Unit: core determinism and rules | Vitest | `packages/core` | Fastest, most numerous; no I/O, no DOM. |
| Content validation | Vitest | `packages/content-base` | Every definition passes its zod schema; tech tree has no cycles; refs resolve. |
| Protocol schema | Vitest | `packages/protocol` | Valid/invalid message fixtures; version rules. |
| Server integration | Vitest + `ws` client | `apps/server/test` | In-process server on port 0; simulate display + controllers. |
| AI | Vitest | `packages/ai` | Seeded scenarios: bot hits a stationary target within tolerance. |
| Golden replays | Vitest | `packages/core/test/replays` | Later (M2+). |
| Controller E2E | Playwright | `apps/controller/e2e` | Later; mobile emulation. |
| Render smoke | Playwright + headless GPU (SwiftShader) | `packages/render` | Later; canvas not blank, no console errors. |

## Core determinism tests

Principle: same `(seed, content hash, command list)` yields the same state hash, always.

- Fixture helper `runScenario({ seed, map, teams, commands })` returns final state + events.
- Assert exact values (no tolerance) for positions, health, terrain checksum after a fixed number of ticks.
- Property tests (fast-check): stepping N ticks in one call equals stepping N times; cloning state mid-run and continuing gives identical results; command order within a tick is stable.
- State hash function (`hashState(state)`, FNV-1a/xxhash over canonical serialisation) is itself tested; used in replays and server/AI cross-checks.
- Guard tests: a lint/test scans `packages/core/src` for forbidden identifiers (`Math.random`, `Date.now`, `performance.now`, `process`, `window`, `document`).
- Terrain: carve a sphere, assert SDF values, dirty-chunk set, and that two identical edit sequences give identical checksums.

```ts
it('bazooka shot at seed 42 destroys the same terrain every run', () => {
  const a = runScenario(shotScenario(42));
  const b = runScenario(shotScenario(42));
  expect(hashState(a.state)).toBe(hashState(b.state));
  expect(a.events.filter((e) => e.type === 'explosion')).toHaveLength(1);
});
```

## Protocol schema tests

- For each message type: a valid fixture parses; each invalid fixture (missing field, wrong type, out-of-range power, oversize string, unknown `t`) fails with the expected issue path.
- Round-trip: `parse(serialize(msg))` equals `msg`.
- Version tests: mismatched `v` yields `version_mismatch`; unknown optional fields are stripped without error.
- Fuzz: random JSON/garbage never throws out of the parse function; it returns a result object.
- Fixtures live in `packages/protocol/test/fixtures/*.json` and are reused by server and controller tests.

## Golden replay tests (later)

A replay file is `{ protocolVersion, contentHash, seed, settings, commands:[{tick, command}], checkpoints:[{tick, stateHash}] }`. CI replays each file in `packages/core/test/replays/` and asserts checkpoint hashes. A deliberate rules change regenerates replays with `pnpm replay:update` in a dedicated commit that explains why; accidental hash changes fail CI. Replays also reproduce user bug reports (the server can export the last match).

## Playwright for controller (later)

- Mobile emulation (Pixel 7 viewport, touch) against a server started by the test config with a fake display client.
- Flows: join with code, lobby ready-up, aim drag and fire, reconnect after `page.context().setOffline(true)`, spectator mode.
- Visual checks are screenshots of non-3D UI only; the 3D view is covered by the render smoke test.

## Practices

- Tests must be deterministic: fake timers (`vi.useFakeTimers`) for server timers; never real sleeps over 50 ms.
- Coverage: `pnpm test:coverage` (v8) gates `packages/core` at 90% lines (run in CI); plain `pnpm test` stays coverage-free and fast. No gate on apps initially.
- Step benchmark: `packages/core/src/sim/step-benchmark.test.ts` asserts mean `sim.step()` < 1 ms (4x4 match, 600 ticks, p99 < 8 ms). Set `SNAILS_BENCH_STRICT=0` to downgrade failures to a warning on noisy machines.
- Bug fix = failing test first.
- Test files obey the same 500-line limit; split by feature.

## Visual reference shots (`pnpm shots`)

`pnpm build && NODE_PATH=$(npm root -g) pnpm shots` writes reference screenshots and an
`index.html` contact sheet to `$SHOTS_DIR` (default `./shots-out`, gitignored). Look at them
before and after any visual change.

- Display, 1920x1080, High tier: `display-close`, `display-wide`, `display-crater`. These use
  `apps/display/harness.html?shot=1&cam=close|wide|crater&seed=7&quality=high`
  (`src/harness/shot-mode.ts`): fixed seed, simulated clock with a fixed frame step, seeded
  particle randomness and a manual frame scheduler, so repeated runs are byte-identical. The
  page sets `window.__shotReady` once terrain meshing is idle and frames have rendered.
- Phone, 390x844, Mobile tier: `phone-my-turn` from a live two-phone match on the real server
  (random seed, so it is only near-identical between runs).
- `pnpm shots --compare <oldDir>` adds the old image beside each new one in the contact sheet
  (keep a copy of the previous run's directory, or download the CI artifact).
- A run takes about 3 minutes under software WebGL. CI uploads the directory as the
  `shots` artifact from the e2e job.
