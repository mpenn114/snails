import { describe, expect, it, vi } from 'vitest';
import { encodeEventBatch, encodeSnapshot } from '@snails/protocol';
import type { DecodedSnapshot, ServerMessage } from '@snails/protocol';
import { MatchAdapter } from './match-adapter';
import type { MatchStarted } from './match-adapter';
import type { HudModel } from './hud-model';

const terrain = {
  nx: 4,
  ny: 4,
  nz: 4,
  cellSize: 1,
  baseHeight: 1,
  hillAmplitude: 1,
  hillFrequency: 1,
  octaves: 1,
  caveDensity: 0,
  caveFrequency: 1,
  waterLevel: 0.5,
  islandFalloff: false,
};
const started = {
  type: 'matchStarted',
  seed: 5,
  terrain,
  settings: {},
  teams: [
    { id: 'a', name: 'Reds', colour: '#f00', snails: [{ id: 's1', name: 'Sid' }] },
    { id: 'b', name: 'Blues', colour: '#00f', snails: [{ id: 's2', name: 'Sal' }] },
  ],
} as unknown as MatchStarted;

const snap: DecodedSnapshot = {
  tick: 7,
  wind: { strength: 0, direction: 0 },
  turn: {
    activeTeamId: 'a',
    activeSnailId: 's1',
    phase: 'action',
    timeRemaining: 12.3,
    turnNumber: 2,
  },
  snails: ['s1', 's2'].map((id, i) => ({
    id,
    position: { x: i, y: 1, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    facing: 0,
    health: id === 's2' ? 50 : 100,
    state: 'grounded' as const,
    aim: { angle: 0, power: 0 },
  })),
  projectiles: [],
};

function setup() {
  const renderer = { init: vi.fn(), pushSnapshot: vi.fn(), handleEvents: vi.fn() };
  const aim = { set: vi.fn() };
  const huds: HudModel[] = [];
  const visible: boolean[] = [];
  const a = new MatchAdapter({
    renderer,
    aim,
    buildInit: () => ({ grid: {} as never, waterLevel: 0.5 }),
    onHud: (h) => huds.push(h),
    onMatchVisible: (v) => visible.push(v),
  });
  return { a, renderer, aim, huds, visible };
}

describe('MatchAdapter', () => {
  it('ignores snapshots before matchStarted', () => {
    const t = setup();
    t.a.handle(encodeSnapshot(snap));
    expect(t.renderer.pushSnapshot).not.toHaveBeenCalled();
  });

  it('inits on matchStarted and supports late join snapshots', () => {
    const t = setup();
    t.a.handle(started);
    t.a.handle(encodeSnapshot(snap));
    expect(t.renderer.init).toHaveBeenCalledTimes(1);
    expect(t.visible).toEqual([true]);
    const pushed = t.renderer.pushSnapshot.mock.calls[0]![0];
    expect(pushed.teams[0].snails[0].name).toBe('Sid');
    const hud = t.huds.at(-1)!;
    expect(hud.turnTeam).toBe('Reds');
    expect(hud.turnSnail).toBe('Sid');
    expect(hud.timerSeconds).toBe(13);
    expect(hud.bars[1]!.fraction).toBe(0.5);
  });

  it('timer, aim and events', () => {
    const t = setup();
    t.a.handle(started);
    t.a.handle(encodeSnapshot(snap));
    t.a.handle({ type: 'turnTimer', remainingMs: 4000 });
    expect(t.huds.at(-1)!.timerSeconds).toBe(4);
    t.a.handle({ type: 'aimPreview', snailId: 's1', angle: 0.5, power: 0.4 });
    expect(t.aim.set).toHaveBeenLastCalledWith(expect.objectContaining({ power: 0.4 }));
    const ev = { type: 'windChanged', strength: 1, direction: 2 } as const;
    t.a.handle(encodeEventBatch(8, [ev]));
    expect(t.renderer.handleEvents).toHaveBeenCalledWith([ev]);
  });

  it('shows the winner then returns to lobby', () => {
    const t = setup();
    t.a.handle(started);
    t.a.handle(encodeSnapshot(snap));
    t.a.handle(encodeEventBatch(9, [{ type: 'matchEnded', status: 'won', winnerTeamId: 'b' }]));
    expect(t.huds.at(-1)!.winner).toEqual({ name: 'Blues', colour: '#00f' });
    t.a.handle({ type: 'lobbyState', phase: 'match' } as ServerMessage);
    expect(t.visible).toEqual([true]);
    expect(t.a.active).toBe(true);
    t.a.handle({ type: 'lobbyState', phase: 'lobby' } as ServerMessage);
    expect(t.visible).toEqual([true, false]);
    expect(t.a.active).toBe(false);
    t.a.handle(encodeSnapshot(snap));
    expect(t.renderer.pushSnapshot).toHaveBeenCalledTimes(1);
  });
});
