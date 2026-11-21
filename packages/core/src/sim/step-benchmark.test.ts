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

describe('sim.step benchmark', () => {
  it('mean step time stays under 1 ms on a default-size 4x4 match', () => {
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
    expect(explosions).toBeGreaterThan(0);
    const strict = process.env['SNAILS_BENCH_STRICT'] !== '0';
    if (!strict && (mean >= MEAN_BUDGET_MS || p99 >= P99_BUDGET_MS)) {
      console.warn(
        `step benchmark over budget: mean ${mean.toFixed(3)} ms, p99 ${p99.toFixed(3)} ms`,
      );
      return;
    }
    expect(mean).toBeLessThan(MEAN_BUDGET_MS);
    expect(p99).toBeLessThan(P99_BUDGET_MS);
    console.info(`step mean ${mean.toFixed(3)} ms, p99 ${p99.toFixed(3)} ms`);
  });
});
