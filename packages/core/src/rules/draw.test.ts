import { describe, expect, it } from 'vitest';
import { kill } from '../entities/snail.js';
import { createMatch } from '../sim/match.js';
import { testMatchOptions } from '../sim/test-match.js';
import { createInitialState } from '../state/game-state.js';
import type { GameState, MatchStatus } from '../state/types.js';
import { resolveDraw } from './win.js';

function twoTeams(): GameState {
  return createInitialState({
    seed: 1,
    terrain: { nx: 4, ny: 4, nz: 4 },
    teams: ['A', 'B'].map((id) => ({
      id,
      name: id,
      colour: '#fff',
      snails: [{ id: `${id}1`, name: id }],
    })),
  });
}

describe('resolveDraw (simultaneous elimination)', () => {
  const draw: MatchStatus = { status: 'draw', winnerTeamId: null };

  it('passes non-draw outcomes through', () => {
    const won: MatchStatus = { status: 'won', winnerTeamId: 'A' };
    expect(resolveDraw(twoTeams(), won)).toBe(won);
  });

  it('gives the win to the team that dealt the most damage that turn', () => {
    const state = twoTeams();
    state.turn.damageDealt = { A: 10, B: 30 };
    expect(resolveDraw(state, draw)).toEqual({ status: 'won', winnerTeamId: 'B' });
  });

  it('stays a draw on a tie or when nobody dealt damage', () => {
    const state = twoTeams();
    expect(resolveDraw(state, draw)).toBe(draw);
    state.turn.damageDealt = { A: 20, B: 20 };
    expect(resolveDraw(state, draw)).toBe(draw);
  });
});

describe('simultaneous elimination in a headless match', () => {
  function finish(damageAB: number, damageBA: number): MatchStatus {
    const { sim } = createMatch({
      ...testMatchOptions(3),
      teams: [
        { id: 'a', name: 'A', colour: '#f00', snailNames: ['A1'] },
        { id: 'b', name: 'B', colour: '#00f', snailNames: ['B1'] },
      ],
    });
    sim.registerTurnStartHook('wipe-out', (ctx) => {
      const hit = (from: string, to: string, amount: number): void =>
        ctx.emit({
          type: 'snailDamaged',
          snailId: to,
          amount,
          remaining: 0,
          sourceSnailId: from,
          cause: 'explosion',
        });
      hit('a:0', 'b:0', damageAB);
      hit('b:0', 'a:0', damageBA);
      for (const t of ctx.state.teams) for (const s of t.snails) kill(s);
    });
    for (let i = 0; i < 20_000 && sim.state.match.status === 'playing'; i++) {
      if (sim.state.turn.phase === 'action') sim.enqueue({ type: 'endTurn', teamId: 'a' });
      sim.step();
    }
    return sim.state.match;
  }

  it('is won by the team with the most damage dealt', () => {
    expect(finish(40, 10)).toEqual({ status: 'won', winnerTeamId: 'a' });
    expect(finish(5, 25)).toEqual({ status: 'won', winnerTeamId: 'b' });
  });

  it('is a draw when damage is level', () => {
    expect(finish(15, 15)).toEqual({ status: 'draw', winnerTeamId: null });
  });
});
