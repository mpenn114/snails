import { loadContentPacks } from '@snails/core';
import { basePack } from '@snails/content-base';
import { describe, expect, it } from 'vitest';
import { runAiMatch } from './run-match.js';
import { runAiMatches, summarize, withoutTimings } from './summary.js';
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
  it('keeps Mastermind planTurn p99 under budget', () => {
    const records = runAiMatches({ ...opts, matches: 3, startSeed: 1 });
    const times = records.flatMap((r) => r.teams.flatMap((t) => t.planTimesMs));
    const stats = thinkTimeStats(times);
    expect(stats.count).toBeGreaterThan(0);
    // Wall-clock timing is noisy on shared CI runners, so CI gets a 500 ms ceiling instead of 250.
    const budget = process.env.CI ? 500 : 250;
    expect(stats.p99).toBeLessThan(budget);
    expect(summarize(records).matches).toBe(3);
  }, 20_000);

  it('is deterministic per seed, ignoring timings', () => {
    const a = runAiMatch({ ...opts, seed: 4 });
    const b = runAiMatch({ ...opts, seed: 4 });
    expect(withoutTimings(a)).toEqual(withoutTimings(b));
    expect(a.errors).toEqual([]);
  }, 20_000);
});
