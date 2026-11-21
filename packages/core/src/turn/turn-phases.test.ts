import { describe, expect, it } from 'vitest';
import { createInitialState } from '../state/game-state.js';
import type { GameState } from '../state/types.js';
import type { SimEvent } from '../sim/types.js';
import {
  DEFAULT_TURN_CONFIG as C,
  advanceTurn,
  notifyFired,
  requestEndTurn,
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
