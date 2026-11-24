import { describe, expect, it } from 'vitest';
import { evaluateGate, gateTeams, runAiGate } from './gate.js';
import type { AiMatchRecord } from './types.js';

function rec(seed: number, o: Partial<AiMatchRecord> & { mmWon?: boolean; ms?: number } = {}) {
  const { mmWon = true, ms = 10, ...rest } = o;
  return {
    seed,
    winner: mmWon ? 0 : 1,
    winnerConfig: { difficulty: mmWon ? 'mastermind' : 'rookie', personality: 'cautious' },
    turns: 10,
    endReason: 'elimination',
    teams: [{ planTimesMs: [ms] }],
    errors: [],
    ...rest,
  } as unknown as AiMatchRecord;
}

describe('evaluateGate', () => {
  const ok = Array.from({ length: 10 }, (_, i) => rec(i));
  it('passes a clean batch', () => expect(evaluateGate(ok)).toEqual([]));
  it('fails on low win rate with seeds', () => {
    const f = evaluateGate([
      ...ok.slice(0, 8),
      rec(98, { mmWon: false }),
      rec(99, { mmWon: false }),
    ]);
    expect(f).toHaveLength(1);
    expect(f[0]).toContain('80%');
    expect(f[0]).toContain('98, 99');
  });
  it('allows exactly 90%', () => {
    expect(evaluateGate([...ok.slice(0, 9), rec(9, { mmWon: false })])).toEqual([]);
  });
  it('flags errors, stalemates and slow think time', () => {
    const f = evaluateGate([
      ...ok.slice(0, 7),
      rec(7, { errors: [{ turn: 1, teamIndex: 0, where: 'stall', message: 'x' }] }),
      rec(8, { endReason: 'turnLimit', winnerConfig: null }),
      rec(9, { ms: 5000 }),
    ]);
    expect(f.some((x) => x.includes('seeds 7'))).toBe(true);
    expect(f.some((x) => x.includes('turn limit') && x.includes('8'))).toBe(true);
    expect(f.some((x) => x.includes('p99'))).toBe(true);
  });
  it('fails an empty batch', () => expect(evaluateGate([])).toHaveLength(1));
});

describe('gateTeams / runAiGate', () => {
  it('alternates seats and cycles personalities', () => {
    expect(gateTeams(2)[0]!.difficulty).toBe('mastermind');
    expect(gateTeams(3)[1]!.difficulty).toBe('mastermind');
    expect(gateTeams(1)[1]!.personality).not.toBe(gateTeams(2)[0]!.personality);
  });
  it('runs a tiny gate end to end', () => {
    const r = runAiGate({
      matches: 1,
      smokeMatches: 1,
      snailsPerTeam: 1,
      turnCap: 6,
      minWinRate: 0,
      maxStalemateRate: 1,
    });
    expect(r.report).toContain('AI gate:');
    expect(r.report).toContain('smoke');
  }, 30_000);
});
