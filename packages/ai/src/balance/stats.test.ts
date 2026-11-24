import { describe, expect, it } from 'vitest';
import {
  aggregate,
  dominantBranch,
  formatDashboard,
  type MatchRecord,
  type TeamRecord,
} from './stats.js';

const timing = { turnSeconds: 30, retreatSeconds: 3, resolveSeconds: 7 };

function team(
  id: string,
  techs: [string, TeamRecord['focus']][],
  capstone: string | null = null,
): TeamRecord {
  return {
    teamId: id,
    focus: 'weaponry',
    researched: techs.map(([t]) => t),
    branches: techs.map(([, b]) => b),
    capstone,
  };
}

function rec(winner: string | null, a: TeamRecord, b: TeamRecord, turns = 10): MatchRecord {
  return {
    seed: 1,
    turns,
    winnerTeamId: winner,
    firstTeamId: 'a',
    endReason: winner ? 'elimination' : 'draw',
    teams: [a, b],
  };
}

describe('balance stats', () => {
  const records = [
    rec('a', team('a', [['x', 'weaponry']], 'cap'), team('b', [['y', 'shell']])),
    rec('a', team('a', [['x', 'weaponry']]), team('b', [['y', 'shell']])),
    rec('b', team('a', [['x', 'weaponry']]), team('b', [['y', 'shell']]), 30),
    rec(null, team('a', []), team('b', []), 20),
  ];
  const r = aggregate(records, timing);

  it('counts matches, winners and first mover', () => {
    expect(r.matches).toBe(4);
    expect(r.decided).toBe(3);
    expect(r.draws).toBe(1);
    expect(r.winsByTeam).toEqual({ a: 2, b: 1 });
    expect(r.firstMoverWinRate).toBeCloseTo(2 / 3);
  });

  it('computes length and minutes', () => {
    expect(r.avgTurns).toBe(17.5);
    expect(r.estMinutes).toBeCloseTo((17.5 * 40) / 60);
  });

  it('computes per-tech rates', () => {
    const x = r.techs.find((t) => t.id === 'x')!;
    expect(x.pickRate).toBeCloseTo(3 / 8);
    expect(x.winningBuildRate).toBeCloseTo(2 / 3);
    expect(x.winRateWhenOwned).toBeCloseTo(2 / 3);
    expect(r.capstones).toEqual({ cap: 1 });
  });

  it('flags first-turn advantage and thin branches', () => {
    expect(r.flags.some((f) => f.includes('first-turn'))).toBe(true);
    expect(r.flags.some((f) => f.startsWith('mobility'))).toBe(true);
    expect(r.flags.some((f) => f.startsWith('x '))).toBe(false);
  });

  it('picks the dominant branch and renders', () => {
    const t = team('a', [
      ['p', 'utility'],
      ['q', 'utility'],
      ['r', 'shell'],
    ]);
    expect(dominantBranch(t)).toBe('utility');
    expect(formatDashboard(r)).toContain('## Target flags');
  });
});
