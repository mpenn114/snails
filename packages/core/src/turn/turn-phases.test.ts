import { describe, expect, it } from 'vitest';
import { createInitialState } from '../state/game-state.js';
import type { GameState } from '../state/types.js';
import type { SimEvent } from '../sim/types.js';
import { findSnail, kill } from '../entities/snail.js';
import { Rng } from '../rng.js';
import { DEFAULT_WIND_CONFIG } from '../sim/wind.js';
import {
  DEFAULT_TURN_CONFIG as C,
  advanceTurn,
  notifyFired,
  requestEndTurn,
  selectNextActive,
  startTurn,
} from './turn-phases.js';

const DT = 0.5;
function setup() {
  const state = createInitialState({
    seed: 1,
    terrain: { nx: 4, ny: 4, nz: 4 },
    teams: [
      { id: 'A', name: 'A', colour: '#f00', snails: [{ id: 'a1', name: 'a1' }] },
      { id: 'B', name: 'B', colour: '#0f0', snails: [{ id: 'b1', name: 'b1' }] },
    ],
  });
  const events: SimEvent[] = [];
  const emit = (e: SimEvent) => events.push(e);
  startTurn(state, C, emit);
  const run = (secs: number) => {
    for (let i = 0; i < secs / DT; i++) advanceTurn(state, C, DT, emit);
  };
  return { state, events, emit, run };
}
const proj = { id: 'p' } as unknown as GameState['projectiles'][number];

describe('turn phases', () => {
  it('runs the full cycle with timings', () => {
    const { state, run, emit, events } = setup();
    run(1.5);
    expect(state.turn.phase).toBe('intro');
    run(0.5);
    expect(state.turn.phase).toBe('action');
    run(10);
    expect(state.turn.timeRemaining).toBe(C.actionDuration - 10);
    notifyFired(state, emit);
    expect(state.turn.phase).toBe('fire');
    run(DT);
    expect(state.turn.phase).toBe('resolve');
    run(C.resolveDelay);
    expect(state.turn.phase).toBe('retreat');
    run(C.retreatDuration);
    expect(state.turn.phase).toBe('settle');
    run(DT);
    expect(state.turn.phase).toBe('intro');
    expect(state.turn.activeTeamId).toBe('B');
    expect(state.turn.turnNumber).toBe(2);
    expect(events.map((e) => e.type)).toContain('turnEnded');
    expect(events.filter((e) => e.type === 'turnStarted')).toHaveLength(2);
  });
  it('timeout skips to settle', () => {
    const { state, run } = setup();
    run(C.introDuration + C.actionDuration);
    expect(state.turn.phase).toBe('settle');
    expect(state.turn.fired).toBe(false);
  });
  it('endTurn skips to settle', () => {
    const { state, run, emit } = setup();
    run(C.introDuration);
    requestEndTurn(state, emit);
    expect(state.turn.phase).toBe('settle');
  });
  it('ignores fire/endTurn outside action', () => {
    const { state, emit } = setup();
    notifyFired(state, emit);
    requestEndTurn(state, emit);
    expect(state.turn.phase).toBe('intro');
  });
  it('fire waits for projectiles', () => {
    const { state, run, emit } = setup();
    run(C.introDuration);
    notifyFired(state, emit);
    state.projectiles.push(proj);
    run(20);
    expect(state.turn.phase).toBe('fire');
    state.projectiles.length = 0;
    run(DT);
    expect(state.turn.phase).toBe('resolve');
  });
  it('settle waits for movement, with timeout', () => {
    const { state, run, emit } = setup();
    run(C.introDuration);
    requestEndTurn(state, emit);
    const s = state.teams[0]!.snails[0]!;
    s.velocity = { x: 3, y: 0, z: 0 };
    run(5);
    expect(state.turn.phase).toBe('settle');
    run(C.settleTimeout - 5);
    expect(state.turn.phase).toBe('intro');
    expect(state.turn.turnNumber).toBe(2);
  });
  it('requestEndTurn after a shot goes to retreat, not settle', () => {
    const { state, run, emit } = setup();
    run(C.introDuration);
    notifyFired(state, emit);
    run(DT);
    expect(state.turn.phase).toBe('resolve');
    run(C.resolveDelay);
    expect(state.turn.phase).toBe('retreat');
    // Ending early from retreat is a no-op (only action can end the turn early).
    requestEndTurn(state, emit);
    expect(state.turn.phase).toBe('retreat');
  });
  it('requestEndTurn after a shot in the same action phase goes to retreat', () => {
    const { state, run, emit } = setup();
    run(C.introDuration + 1);
    state.turn.fired = true;
    requestEndTurn(state, emit);
    expect(state.turn.phase).toBe('retreat');
  });
  it('state survives a JSON round trip mid-turn', () => {
    const a = setup();
    a.run(C.introDuration + 5);
    const copy = JSON.parse(JSON.stringify(a.state)) as GameState;
    for (let i = 0; i < 40; i++) {
      advanceTurn(a.state, C, DT, () => undefined);
      advanceTurn(copy, C, DT, () => undefined);
    }
    expect(copy).toEqual(a.state);
  });
});

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

/** Runs one selection and makes it the active turn, returning the chosen snail id. */
function pick(state: GameState): string | undefined {
  const next = selectNextActive(state);
  if (!next) return undefined;
  state.turn.activeTeamId = next.teamId;
  state.turn.activeSnailId = next.snailId;
  return next.snailId;
}

function picks(state: GameState, n: number): (string | undefined)[] {
  return Array.from({ length: n }, () => pick(state));
}

describe('team rotation and snail selection', () => {
  it('rotates through teams in order, starting with team 0 on the first turn', () => {
    const state = build([
      { id: 'A', snails: ['a1'] },
      { id: 'B', snails: ['b1'] },
      { id: 'C', snails: ['c1'] },
    ]);
    state.turn.activeTeamId = null;
    state.turn.activeSnailId = null;
    expect(picks(state, 4)).toEqual(['a1', 'b1', 'c1', 'a1']);
  });
  it('each team cycles its own snails independently', () => {
    const state = build([
      { id: 'A', snails: ['a1', 'a2'] },
      { id: 'B', snails: ['b1', 'b2', 'b3'] },
      { id: 'C', snails: ['c1'] },
    ]);
    // Team A's first snail is already active from createInitialState.
    expect(picks(state, 6)).toEqual(['b1', 'c1', 'a2', 'b2', 'c1', 'a1']);
    expect(picks(state, 3)).toEqual(['b3', 'c1', 'a2']);
  });
  it('wraps from the last team back to the first', () => {
    const state = build([
      { id: 'A', snails: ['a1'] },
      { id: 'B', snails: ['b1'] },
      { id: 'C', snails: ['c1'] },
    ]);
    state.turn.activeTeamId = 'C';
    expect(selectNextActive(state)).toEqual({ teamId: 'A', snailId: 'a1' });
  });
  it('skips dead snails within a team', () => {
    const state = build([
      { id: 'A', snails: ['a1', 'a2', 'a3'] },
      { id: 'B', snails: ['b1'] },
    ]);
    kill(findSnail(state, 'a2')!);
    state.turn.activeTeamId = 'B';
    expect(picks(state, 3)).toEqual(['a3', 'b1', 'a1']);
    expect(picks(state, 2)).toEqual(['b1', 'a3']);
  });
  it('skips a team with no living snails', () => {
    const state = build([
      { id: 'A', snails: ['a1'] },
      { id: 'B', snails: ['b1'] },
      { id: 'C', snails: ['c1'] },
    ]);
    kill(findSnail(state, 'b1')!);
    expect(picks(state, 3)).toEqual(['c1', 'a1', 'c1']);
  });
  it('returns the only living team repeatedly, and null when none are alive', () => {
    const state = build([
      { id: 'A', snails: ['a1'] },
      { id: 'B', snails: ['b1'] },
    ]);
    kill(findSnail(state, 'b1')!);
    expect(picks(state, 2)).toEqual(['a1', 'a1']);
    kill(findSnail(state, 'a1')!);
    expect(selectNextActive(state)).toBeNull();
  });
  it('keeps per-team cursors through a JSON round trip', () => {
    const state = build([
      { id: 'A', snails: ['a1', 'a2', 'a3'] },
      { id: 'B', snails: ['b1', 'b2'] },
    ]);
    picks(state, 3);
    const copy = JSON.parse(JSON.stringify(state)) as GameState;
    expect(copy.teams.map((t) => t.nextSnailIndex)).toEqual(
      state.teams.map((t) => t.nextSnailIndex),
    );
    expect(picks(copy, 4)).toEqual(picks(state, 4));
  });

  it('rolls wind on each new turn and emits windChanged', () => {
    const state = createInitialState({
      seed: 1,
      terrain: { nx: 4, ny: 4, nz: 4 },
      teams: [
        { id: 'A', name: 'A', colour: '#f00', snails: [{ id: 'a1', name: 'a1' }] },
        { id: 'B', name: 'B', colour: '#0f0', snails: [{ id: 'b1', name: 'b1' }] },
      ],
    });
    const events: SimEvent[] = [];
    const emit = (e: SimEvent) => events.push(e);
    const wind = { rng: new Rng(8), config: DEFAULT_WIND_CONFIG };
    startTurn(state, C, emit, wind);
    const strengths = [state.wind.strength];
    const changes = () => events.filter((e) => e.type === 'windChanged');
    expect(changes()).toHaveLength(1);
    for (let i = 0; i < 3; i++) {
      events.length = 0;
      // Advance in steps until the next turn starts (intro again after settle).
      let guard = 0;
      do {
        advanceTurn(state, C, 0.5, emit, wind);
      } while (!changes().length && guard++ < 10000);
      expect(changes()).toHaveLength(1);
      strengths.push(state.wind.strength);
    }
    expect(new Set(strengths).size).toBeGreaterThan(1);
    expect(changes()[0]).toEqual({
      type: 'windChanged',
      strength: state.wind.strength,
      direction: state.wind.direction,
    });
  });
});
