import { describe, expect, it } from 'vitest';
import type { WeaponDefinition } from '../content/types.js';
import { createMatch } from './match.js';
import { createScriptedBot } from './scripted-bot.js';

const PEBBLE: WeaponDefinition = {
  id: 'test:pebble-toss',
  name: 'Pebble Toss',
  kind: 'projectile',
  launch: { minSpeed: 5, maxSpeed: 22, gravityScale: 1, windScale: 1, projectileRadius: 0.1 },
  fuseSeconds: 0,
  explosion: { radius: 4, maxDamage: 45, knockback: 6, falloff: 'linear' },
  ammo: 'infinite',
};

const WARMUP_TICKS = 120;
const MEASURED_TICKS = 600;
const MEAN_BUDGET_MS = 1;
const P99_BUDGET_MS = 8;

function percentile(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] as number;
}

/** Looser p99 budget off CI (shared/loaded dev machines, coverage instrumentation). */
function p99Budget(): number {
  const relaxed =
    !process.env['CI'] || (process.env['npm_lifecycle_event'] ?? '').includes('coverage');
  return relaxed ? P99_BUDGET_MS * 2 : P99_BUDGET_MS;
}

const MAX_RUNS = 3;

interface RunResult {
  readonly mean: number;
  readonly p99: number;
  readonly explosions: number;
}

/** One full match measurement. */
function measureRun(): RunResult {
  const ids = ['a', 'b', 'c', 'd'];
  const { sim } = createMatch({
    seed: 11,
    teams: ids.map((id) => ({
      id,
      name: id,
      colour: '#888',
      snailNames: [1, 2, 3, 4].map((n) => `${id}${n}`),
    })),
    turn: { introDuration: 0.5, retreatDuration: 0.5 },
    weapons: [PEBBLE],
  });
  const bots = ids.map((id) => createScriptedBot(id, PEBBLE));
  const times: number[] = [];
  let explosions = 0;
  for (let i = 0; i < WARMUP_TICKS + MEASURED_TICKS; i++) {
    for (const bot of bots) bot(sim);
    const t0 = performance.now();
    const events = sim.step();
    const dt = performance.now() - t0;
    if (i >= WARMUP_TICKS) times.push(dt);
    explosions += events.filter((e) => e.type === 'explosion').length;
  }
  const mean = times.reduce((a, b) => a + b, 0) / times.length;
  const p99 = percentile(
    [...times].sort((a, b) => a - b),
    0.99,
  );
  return { mean, p99, explosions };
}

describe('sim.step benchmark', () => {
  it('mean step time stays under 1 ms on a default-size 4x4 match', () => {
    // Best of up to MAX_RUNS: a real regression fails every run; machine load rarely does.
    const p99Limit = p99Budget();
    let best: RunResult | null = null;
    for (let run = 0; run < MAX_RUNS; run++) {
      const r = measureRun();
      expect(r.explosions).toBeGreaterThan(0);
      if (!best || r.mean + r.p99 < best.mean + best.p99) best = r;
      if (r.mean < MEAN_BUDGET_MS && r.p99 < p99Limit) break;
    }
    const { mean, p99 } = best as RunResult;
    const strict = process.env['SNAILS_BENCH_STRICT'] !== '0';
    if (!strict && (mean >= MEAN_BUDGET_MS || p99 >= p99Limit)) {
      console.warn(
        `step benchmark over budget: mean ${mean.toFixed(3)} ms, p99 ${p99.toFixed(3)} ms`,
      );
      return;
    }
    expect(mean).toBeLessThan(MEAN_BUDGET_MS);
    expect(p99).toBeLessThan(p99Limit);
    console.info(`step mean ${mean.toFixed(3)} ms, p99 ${p99.toFixed(3)} ms`);
  });
});
