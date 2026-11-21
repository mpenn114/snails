import { describe, expect, it } from 'vitest';
import { createInitialState } from '../state/game-state.js';
import type { GameState } from '../state/types.js';
import { findSnail, kill } from '../entities/snail.js';
import { evaluateMatch, evaluateTurnLimit } from './win.js';

function build(teams: { id: string; snails: string[] }[]): GameState {
  return createInitialState({
    seed: 1,
    terrain: { nx: 4, ny: 4, nz: 4 },
    teams: teams.map((t) => ({
      id: t.id,
      name: t.id,
      colour: '#fff',
      snails: t.snails.map((id) => ({ id, name: id })),
    })),
  });
}

describe('evaluateMatch', () => {
  it('is playing while two or more teams have living snails', () => {
    const state = build([
      { id: 'A', snails: ['a1'] },
      { id: 'B', snails: ['b1'] },
    ]);
    expect(evaluateMatch(state)).toEqual({ status: 'playing', winnerTeamId: null });
  });
  it('is won by the last team standing', () => {
    const state = build([
      { id: 'A', snails: ['a1', 'a2'] },
      { id: 'B', snails: ['b1'] },
    ]);
    kill(findSnail(state, 'b1')!);
    expect(evaluateMatch(state)).toEqual({ status: 'won', winnerTeamId: 'A' });
  });
  it('is a draw when every team is wiped out', () => {
    const state = build([
      { id: 'A', snails: ['a1'] },
      { id: 'B', snails: ['b1'] },
    ]);
    kill(findSnail(state, 'a1')!);
    kill(findSnail(state, 'b1')!);
    expect(evaluateMatch(state)).toEqual({ status: 'draw', winnerTeamId: null });
  });
});

describe('evaluateTurnLimit', () => {
  it('is unlimited when maxTurns is undefined', () => {
    const state = build([
      { id: 'A', snails: ['a1'] },
      { id: 'B', snails: ['b1'] },
    ]);
    state.turn.turnNumber = 1000;
    expect(evaluateTurnLimit(state, undefined).status).toBe('playing');
  });
  it('is playing before the limit is reached', () => {
    const state = build([
      { id: 'A', snails: ['a1'] },
      { id: 'B', snails: ['b1'] },
    ]);
    state.turn.turnNumber = 4;
    expect(evaluateTurnLimit(state, 5).status).toBe('playing');
  });
  it('awards the team with the most total health', () => {
    const state = build([
      { id: 'A', snails: ['a1', 'a2'] },
      { id: 'B', snails: ['b1'] },
    ]);
    findSnail(state, 'a1')!.health = 30;
    findSnail(state, 'a2')!.health = 40;
    findSnail(state, 'b1')!.health = 60;
    state.turn.turnNumber = 5;
    expect(evaluateTurnLimit(state, 5)).toEqual({ status: 'won', winnerTeamId: 'A' });
  });
  it('is a draw when total health is tied', () => {
    const state = build([
      { id: 'A', snails: ['a1'] },
      { id: 'B', snails: ['b1'] },
    ]);
    findSnail(state, 'a1')!.health = 50;
    findSnail(state, 'b1')!.health = 50;
    state.turn.turnNumber = 5;
    expect(evaluateTurnLimit(state, 5)).toEqual({ status: 'draw', winnerTeamId: null });
  });
});
