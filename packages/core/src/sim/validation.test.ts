import { describe, expect, it } from 'vitest';
import { RngStreams } from '../rng-streams.js';
import { createInitialState } from '../state/game-state.js';
import { SdfGrid } from '../terrain/sdf-grid.js';
import type { GameState, TurnPhase } from '../state/types.js';
import { Simulation } from './simulation.js';
import type { Command } from './types.js';
import { validateCommand, type RejectionReason } from './validation.js';

function makeState(phase: TurnPhase = 'action'): GameState {
  const state = createInitialState({
    seed: 1,
    teams: [
      { id: 'a', name: 'A', colour: '#f00', snails: [{ id: 'a1', name: 'a1' }] },
      { id: 'b', name: 'B', colour: '#00f', snails: [{ id: 'b1', name: 'b1' }] },
    ],
    terrain: { nx: 2, ny: 2, nz: 2 },
  });
  state.turn.phase = phase;
  return state;
}

const weapons = { has: (id: string) => id === 'bazooka' };
const move: Command = { type: 'move', snailId: 'a1', direction: 1 };
const aim: Command = { type: 'aim', snailId: 'a1', angle: 0.5, power: 0.5 };
const fire: Command = { type: 'fire', snailId: 'a1', weaponId: 'bazooka' };
const end: Command = { type: 'endTurn', teamId: 'a' };

type Row = [string, Command, (s: GameState) => void, RejectionReason | null, string?];
const rows: Row[] = [
  ['move ok', move, () => {}, null],
  ['aim ok', aim, () => {}, null],
  ['fire ok', fire, () => {}, null],
  ['endTurn ok', end, () => {}, null],
  ['move in retreat ok', move, (s) => (s.turn.phase = 'retreat'), null],
  ['endTurn in retreat ok', end, (s) => (s.turn.phase = 'retreat'), null],
  ['match over', move, (s) => (s.match.status = 'won'), 'MATCH_OVER'],
  ['wrong issuer', move, () => {}, 'NOT_YOUR_TURN', 'b'],
  ['endTurn wrong team', { type: 'endTurn', teamId: 'b' }, () => {}, 'NOT_YOUR_TURN'],
  ['unknown snail', { ...move, snailId: 'zz' }, () => {}, 'UNKNOWN_SNAIL'],
  ['non-active snail', { ...move, snailId: 'b1' }, () => {}, 'SNAIL_NOT_ACTIVE'],
  ['dead snail', move, (s) => (s.teams[0]!.snails[0]!.alive = false), 'SNAIL_DEAD'],
  ['aim in retreat', aim, (s) => (s.turn.phase = 'retreat'), 'WRONG_PHASE'],
  ['fire in fire phase', fire, (s) => (s.turn.phase = 'fire'), 'WRONG_PHASE'],
  ['move in settle', move, (s) => (s.turn.phase = 'settle'), 'WRONG_PHASE'],
  ['endTurn in intro', end, (s) => (s.turn.phase = 'intro'), 'WRONG_PHASE'],
  ['unknown weapon', { ...fire, weaponId: 'nope' }, () => {}, 'UNKNOWN_WEAPON'],
  ['already fired', fire, (s) => (s.turn.fired = true), 'ALREADY_FIRED'],
  ['bad direction', { ...move, direction: 2 as 1 }, () => {}, 'INVALID_VALUE'],
  ['NaN angle', { ...aim, angle: NaN }, () => {}, 'INVALID_VALUE'],
  ['aim with facing ok', { ...aim, facing: -2 }, () => {}, null],
  ['NaN facing', { ...aim, facing: NaN }, () => {}, 'INVALID_VALUE'],
  ['infinite facing', { ...aim, facing: Infinity }, () => {}, 'INVALID_VALUE'],
  ['power > 1', { ...aim, power: 1.5 }, () => {}, 'INVALID_VALUE'],
  ['power < 0', { ...aim, power: -0.1 }, () => {}, 'INVALID_VALUE'],
];

describe('validateCommand', () => {
  it.each(rows)('%s', (_name, cmd, mutate, reason, issuer) => {
    const state = makeState();
    mutate(state);
    const res = validateCommand(state, cmd, { weapons, issuerTeamId: issuer });
    if (reason === null) expect(res).toEqual({ ok: true });
    else expect(res).toMatchObject({ ok: false, reason });
  });

  it('skips weapon check without a registry', () => {
    expect(validateCommand(makeState(), { ...fire, weaponId: 'x' })).toEqual({ ok: true });
  });
});

describe('Simulation.submit', () => {
  function sim(): Simulation {
    return new Simulation({
      state: makeState(),
      terrain: new SdfGrid(2, 2, 2, 1),
      rng: new RngStreams(1),
      weapons,
    });
  }

  it('rejects at submit without queueing', () => {
    const s = sim();
    const seen: string[] = [];
    s.registerCommandHandler('move', () => seen.push('move'));
    expect(s.submit({ ...move, snailId: 'b1' })).toMatchObject({ reason: 'SNAIL_NOT_ACTIVE' });
    s.step();
    expect(seen).toEqual([]);
  });

  it('rejects at drain when the phase changed after submit', () => {
    const s = sim();
    const seen: string[] = [];
    s.registerCommandHandler('aim', () => seen.push('aim'));
    expect(s.submit(aim, 'a')).toEqual({ ok: true });
    s.state.turn.phase = 'settle';
    const events = s.step();
    expect(seen).toEqual([]);
    expect(events).toContainEqual({
      type: 'commandRejected',
      command: 'aim',
      reason: 'WRONG_PHASE',
    });
  });

  it('dispatches accepted commands and wires endTurn to requestEndTurn', () => {
    const s = sim();
    expect(s.submit(end, 'a')).toEqual({ ok: true });
    s.step();
    expect(s.state.turn.phase).toBe('settle');
  });
});
