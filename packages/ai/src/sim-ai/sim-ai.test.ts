import { loadContentPacks, TERRAIN_STYLES } from '@snails/core';
import { basePack } from '@snails/content-base';
import { describe, expect, it } from 'vitest';
import { DIFFICULTY_PROFILES } from '../cpu/difficulty.js';
import { runAiMatch } from './run-match.js';
import { formatStyleTable, runAiMatches, summarize, withoutTimings } from './summary.js';
import { thinkTimeStats } from './think-time.js';

const registries = loadContentPacks([basePack]).registries;
const base = {
  registries,
  teams: [
    { difficulty: 'mastermind', personality: 'aggressive' },
    { difficulty: 'rookie', personality: 'cautious' },
  ] as const,
  snailsPerTeam: 1,
  turnCap: 8,
};
const opts = { ...base, teams: [...base.teams] };

describe('thinkTimeStats', () => {
  it('computes nearest-rank percentiles', () => {
    const s = thinkTimeStats(Array.from({ length: 100 }, (_, i) => i + 1));
    expect(s).toEqual({ count: 100, p50: 50, p95: 95, p99: 99, max: 100 });
    expect(thinkTimeStats([]).max).toBe(0);
  });
});

describe('AI match runner', () => {
  it('keeps Mastermind planTurn within its think budget', () => {
    const records = runAiMatches({ ...opts, matches: 3, startSeed: 1 });
    const mastermind = records.flatMap((r) => r.teams.filter((t) => t.difficulty === 'mastermind'));
    const work = mastermind.flatMap((t) => t.planWork);
    const stats = thinkTimeStats(mastermind.flatMap((t) => t.planTimesMs));
    expect(stats.count).toBeGreaterThan(0);
    // The deterministic work counter is the real gate: it does not depend on machine load, so it
    // cannot flake when the whole suite runs in parallel. A turn may overshoot its budget only by
    // one in-flight solve, hence the small slack.
    const budget = DIFFICULTY_PROFILES.mastermind.thinkBudget;
    expect(Math.max(...work)).toBeLessThanOrEqual(budget + 60);
    // Wall-clock p99 is logged (about 120 ms standalone) and only guarded by a generous cap that
    // still catches runaway planning (e.g. a lost budget) under parallel test load.
    console.info(
      `Mastermind planTurn p50 ${stats.p50.toFixed(0)} ms, p99 ${stats.p99.toFixed(0)} ms`,
    );
    expect(stats.p99).toBeLessThan(1000);
    expect(summarize(records).matches).toBe(3);
  }, 30_000);

  it('is deterministic per seed, ignoring timings', () => {
    const a = runAiMatch({ ...opts, seed: 4 });
    const b = runAiMatch({ ...opts, seed: 4 });
    expect(withoutTimings(a)).toEqual(withoutTimings(b));
    expect(a.errors).toEqual([]);
  }, 20_000);
});

describe('retreat delivery', () => {
  it('moves the shooter during the retreat phase', () => {
    let phase = '';
    let start: { x: number; z: number } | null = null;
    let moved = 0;
    runAiMatch({
      ...opts,
      teams: [
        { difficulty: 'veteran', personality: 'cautious' },
        { difficulty: 'veteran', personality: 'cautious' },
      ],
      seed: 5,
      turnCap: 6,
      onStep: (m) => {
        const { turn } = m.sim.state;
        const snail = m.sim.state.teams
          .flatMap((t) => t.snails)
          .find((s) => s.id === turn.activeSnailId);
        if (!snail) return;
        if (turn.phase === 'retreat' && phase !== 'retreat') start = { ...snail.position };
        if (turn.phase === 'retreat' && start) {
          moved = Math.max(
            moved,
            Math.hypot(snail.position.x - start.x, snail.position.z - start.z),
          );
        }
        phase = turn.phase;
      },
    });
    expect(moved).toBeGreaterThan(0.5);
  }, 30_000);
});

describe('terrain styles', () => {
  it.each(TERRAIN_STYLES)(
    'plays a match on %s without CPU errors',
    (style) => {
      const rec = runAiMatch({ ...opts, seed: 3, style });
      expect(rec.style).toBe(style);
      expect(rec.errors).toEqual([]);
      expect(rec.turns).toBeGreaterThan(0);
      expect(formatStyleTable([rec])).toContain(style);
    },
    60_000,
  );
});
