import { describe, expect, it } from 'vitest';
import { createInitialState } from '../state/game-state.js';
import type { GameState } from '../state/types.js';
import type { SimEvent } from '../sim/types.js';
import { findSnail, kill } from '../entities/snail.js';
import { validateCommand } from '../sim/validation.js';
import {
  DEFAULT_TURN_CONFIG,
  type TurnConfig,
  advanceTurn,
  requestEndTurn,
  startTurn,
} from './turn-phases.js';

const DT = 0.5;

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

/** Two-team match with a started first turn; `run` advances the phases by `secs`. */
function duel(config: TurnConfig = DEFAULT_TURN_CONFIG) {
  const state = build([
    { id: 'A', snails: ['a1', 'a2'] },
    { id: 'B', snails: ['b1'] },
  ]);
  const events: SimEvent[] = [];
  const emit = (e: SimEvent) => events.push(e);
  startTurn(state, config, emit);
  const run = (secs: number) => {
    for (let i = 0; i < secs / DT; i++) advanceTurn(state, config, DT, emit);
  };
  /** Runs a whole turn with no shot: intro, action timeout, settle. */
  const fullTurn = () => run(config.introDuration + config.actionDuration + DT);
  return { state, events, emit, run, fullTurn, config };
}

describe('match end', () => {
  it('ends with a winner once settle completes after the last rival dies', () => {
    const { state, events, fullTurn } = duel();
    kill(findSnail(state, 'b1')!);
    fullTurn();
    expect(state.match).toEqual({ status: 'won', winnerTeamId: 'A' });
    expect(events.find((e) => e.type === 'matchEnded')).toEqual({
      type: 'matchEnded',
      status: 'won',
      winnerTeamId: 'A',
    });
    expect(state.turn.turnNumber).toBe(1);
  });
  it('does not decide the match while snails are still moving', () => {
    const { state, run, emit } = duel();
    kill(findSnail(state, 'b1')!);
    run(DEFAULT_TURN_CONFIG.introDuration);
    requestEndTurn(state, emit);
    findSnail(state, 'a1')!.velocity = { x: 3, y: 0, z: 0 };
    run(5);
    expect(state.match.status).toBe('playing');
  });
  it('resolves mutual destruction as a draw', () => {
    const { state, events, fullTurn } = duel();
    kill(findSnail(state, 'a1')!);
    kill(findSnail(state, 'a2')!);
    kill(findSnail(state, 'b1')!);
    fullTurn();
    expect(state.match).toEqual({ status: 'draw', winnerTeamId: null });
    expect(events.find((e) => e.type === 'matchEnded')).toEqual({
      type: 'matchEnded',
      status: 'draw',
    });
  });
  it('stops advancing turns once the match has ended', () => {
    const { state, events, fullTurn, run } = duel();
    kill(findSnail(state, 'b1')!);
    fullTurn();
    const turnBefore = JSON.stringify(state.turn);
    const eventCount = events.length;
    run(60);
    expect(JSON.stringify(state.turn)).toBe(turnBefore);
    expect(events.length).toBe(eventCount);
  });
  it('turn limit ends the match with the healthiest team winning', () => {
    const { state, fullTurn } = duel({ ...DEFAULT_TURN_CONFIG, maxTurns: 1 });
    findSnail(state, 'a1')!.health = 10;
    fullTurn();
    expect(state.match).toEqual({ status: 'won', winnerTeamId: 'A' });
  });
  it('turn limit tie is a draw', () => {
    const { state, fullTurn } = duel({ ...DEFAULT_TURN_CONFIG, maxTurns: 1 });
    kill(findSnail(state, 'a2')!);
    findSnail(state, 'a1')!.health = 50;
    findSnail(state, 'b1')!.health = 50;
    fullTurn();
    expect(state.match).toEqual({ status: 'draw', winnerTeamId: null });
  });
  it('commands are rejected with MATCH_OVER after the match ends', () => {
    const { state, fullTurn } = duel();
    kill(findSnail(state, 'b1')!);
    fullTurn();
    expect(validateCommand(state, { type: 'endTurn', teamId: 'A' })).toMatchObject({
      ok: false,
      reason: 'MATCH_OVER',
    });
  });
});
