import { describe, expect, it, vi } from 'vitest';
import { dragToAim, screenFacing, stickToMove, stickToTurn, stickToWireMove } from './aim-mapping';
import type { ScreenFacing } from './aim-mapping';
import { clampKnob, onChange } from './joystick';
import { findMyTeam, isMyTurn } from './my-turn';
import { createThrottle } from './throttle';
import {
  formatTimer,
  isWarning,
  remainingAt,
  startTimer,
  syncTimer,
  turnLabel,
} from './turn-timer';
import { buildWeaponTiles } from './weapon-list';

describe('my turn', () => {
  it('derives team and turn', () => {
    const players = [
      { id: 'a', teamId: 't1' },
      { id: 'b', teamId: null },
    ];
    expect(findMyTeam('a', players)).toBe('t1');
    expect(findMyTeam('b', players)).toBeNull();
    expect(findMyTeam('zz', players)).toBeNull();
    expect(findMyTeam(null, players)).toBeNull();
    expect(isMyTurn('t1', { activeTeamId: 't1', activeSnailId: 's' })).toBe(true);
    expect(isMyTurn('t1', { activeTeamId: 't2', activeSnailId: 's' })).toBe(false);
    expect(isMyTurn(null, { activeTeamId: null, activeSnailId: null })).toBe(false);
  });
});

describe('joystick', () => {
  it('applies deadzone with hysteresis along the facing', () => {
    const f = { x: 1, y: 0 };
    expect(stickToWireMove(10, 0, f, 18)).toBe('stop');
    expect(stickToWireMove(20, 0, f, 18)).toBe('right');
    expect(stickToWireMove(-20, 0, f, 18)).toBe('left');
    expect(stickToWireMove(14, 0, f, 18, 'right')).toBe('right');
    expect(stickToWireMove(5, 0, f, 18, 'right')).toBe('stop');
  });
  it('clamps the knob', () => {
    expect(clampKnob(30, 40, 100)).toEqual({ x: 30, y: 40 });
    const k = clampKnob(300, 400, 100);
    expect(k.x).toBeCloseTo(60);
    expect(k.y).toBeCloseTo(80);
    expect(clampKnob(0, 0, 10)).toEqual({ x: 0, y: 0 });
  });
  it('emits only on change', () => {
    const emit = vi.fn();
    const f = onChange<string>(emit, 'stop');
    f('stop');
    f('left');
    f('left');
    f('stop');
    expect(emit.mock.calls).toEqual([['left'], ['stop']]);
  });
});

const R: ScreenFacing = { x: 1, y: 0 };
const L: ScreenFacing = { x: -1, y: 0 };

describe('aim mapping', () => {
  it('maps drag to elevation and power', () => {
    expect(dragToAim(2, 2, R, 100)).toBeNull();
    const up = dragToAim(100, -100, R, 200);
    expect(up?.angle).toBeCloseTo(Math.PI / 4);
    expect(up?.power).toBeCloseTo(0.707, 2);
    expect(dragToAim(500, 0, R, 100)?.power).toBe(1);
  });
  it('mirrors for a left-facing snail and handles backward drags', () => {
    expect(dragToAim(-100, -100, L, 200)?.angle).toBeCloseTo(Math.PI / 4);
    expect(Math.abs(dragToAim(-100, 0, R, 200)?.angle ?? 0)).toBeCloseTo(Math.PI / 2);
    expect(dragToAim(10, 10, R, 0)).toBeNull();
  });
});

describe('throttle', () => {
  it('sends leading, then latest on trailing edge', () => {
    let t = 0;
    const timers: Array<() => void> = [];
    const send = vi.fn();
    const th = createThrottle<number>(send, 50, {
      now: () => t,
      setTimeout: (fn) => timers.push(fn),
      clearTimeout: () => timers.pop(),
    });
    th.push(1);
    t = 10;
    th.push(2);
    t = 20;
    th.push(3);
    expect(send.mock.calls).toEqual([[1]]);
    t = 50;
    timers[0]?.();
    expect(send.mock.calls).toEqual([[1], [3]]);
    t = 200;
    th.push(4);
    expect(send).toHaveBeenLastCalledWith(4);
  });
  it('cancel drops pending', () => {
    let t = 0;
    const timers: Array<() => void> = [];
    const send = vi.fn();
    const th = createThrottle<number>(send, 50, {
      now: () => t,
      setTimeout: (fn) => timers.push(fn),
      clearTimeout: () => undefined,
    });
    th.push(1);
    t = 5;
    th.push(2);
    th.cancel();
    timers[0]?.();
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe('turn timer', () => {
  it('counts down and resyncs', () => {
    const m = startTimer(30000, 1000);
    expect(remainingAt(m, 11000)).toBe(20000);
    expect(remainingAt(m, 99999)).toBe(0);
    expect(remainingAt(syncTimer(8000, 2000), 3000)).toBe(7000);
  });
  it('formats and warns', () => {
    expect(formatTimer(12001)).toBe('13');
    expect(formatTimer(0)).toBe('0');
    expect(formatTimer(-5)).toBe('0');
    expect(formatTimer(75000)).toBe('1:15');
    expect(isWarning(4999)).toBe(true);
    expect(isWarning(5000)).toBe(false);
  });
  it('labels turns', () => {
    expect(turnLabel('Red', 'Sid', true)).toBe('Your turn');
    expect(turnLabel(null, null, false)).toBe('Waiting...');
    expect(turnLabel('Red', null, false)).toBe('Red');
    expect(turnLabel('Red', 'Sid', false)).toBe('Red: Sid');
  });
});

describe('weapon tiles', () => {
  const ws = [
    { id: 'a', name: 'Alpha', ammo: 'infinite' as const },
    { id: 'b', name: 'Beta', ammo: 0 },
    { id: 'c', name: 'Gamma', ammo: 3 },
  ];
  it('builds tiles and disables off-turn or empty', () => {
    const on = buildWeaponTiles(ws, 'a', true);
    expect(on.map((t) => t.disabled)).toEqual([false, true, false]);
    expect(on[0]).toMatchObject({ icon: 'A', ammoLabel: '∞', selected: true });
    expect(on[2]?.ammoLabel).toBe('3');
    expect(buildWeaponTiles(ws, null, false).every((t) => t.disabled)).toBe(true);
  });
});

describe('camera-relative mapping', () => {
  const H = Math.PI / 2;
  // Core facing f points along (cos f, -sin f); rig yaw c puts the camera at offset (cos c, sin c).
  // Expected on-screen facing (x right, y down): [camYaw, facing, x, y].
  it.each([
    [H, 0, 1, 0],
    [H, Math.PI, -1, 0],
    [0, H, 1, 0],
    [0, -H, -1, 0],
    [Math.PI, -H, 1, 0],
    [Math.PI, H, -1, 0],
    [-H, 0, -1, 0],
    [-H, Math.PI, 1, 0],
    // Behind the snail: facing is perpendicular to screen-right, forward is screen-up.
    [H, H, 0, -1],
    [0, Math.PI, 0, -1],
    [H, -H, 0, 1],
  ])('camera yaw %f, facing %f -> screen (%i, %i)', (camYaw, facing, x, y) => {
    const f = screenFacing(facing, camYaw);
    expect(f.x).toBeCloseTo(x);
    expect(f.y).toBeCloseTo(y);
  });
  it('behind view: stick up is forward, down is back, sideways does not crawl', () => {
    const up = screenFacing(Math.PI / 2, Math.PI / 2);
    expect(stickToWireMove(0, -40, up, 18)).toBe('right');
    expect(stickToWireMove(0, 40, up, 18)).toBe('left');
    expect(stickToWireMove(40, 0, up, 18)).toBe('stop');
  });
  it('side view facing left: stick-left is forward', () => {
    expect(stickToWireMove(-40, 0, L, 18)).toBe('right');
    expect(stickToWireMove(40, 0, L, 18)).toBe('left');
  });
  it('side view: a drag toward the facing aims along it for either facing', () => {
    expect(dragToAim(50, 0, R, 100)?.angle).toBeCloseTo(0);
    expect(dragToAim(-50, 0, L, 100)?.angle).toBeCloseTo(0);
    expect(Math.abs(dragToAim(50, 0, L, 100)?.angle ?? 0)).toBeCloseTo(H);
  });
  it('behind view: drag up is steeper, down is flatter, sideways is flat', () => {
    const b = screenFacing(H, H);
    const up = dragToAim(0, -100, b, 100)?.angle ?? 0;
    const down = dragToAim(0, 100, b, 100)?.angle ?? 0;
    expect(up).toBeCloseTo(Math.PI / 4);
    expect(down).toBeCloseTo(-Math.PI / 4);
    expect(dragToAim(60, 0, b, 100)?.angle).toBeCloseTo(0);
  });
});

describe('two-axis stick (crawl and turn)', () => {
  it('side view facing right: stick-up turns counter-clockwise, stick-down clockwise', () => {
    expect(stickToTurn(0, -60, R, 60, 18)).toBe(1);
    expect(stickToTurn(0, 60, R, 60, 18)).toBe(-1);
    expect(stickToTurn(0, -10, R, 60, 18)).toBe(0);
    expect(stickToTurn(40, 0, R, 60, 18)).toBe(0);
  });
  it('side view facing left mirrors the turn sign', () => {
    expect(stickToTurn(0, -60, L, 60, 18)).toBe(-1);
    expect(stickToTurn(0, 60, L, 60, 18)).toBe(1);
  });
  it('behind view: stick-left turns counter-clockwise', () => {
    const up = screenFacing(Math.PI / 2, Math.PI / 2);
    expect(stickToTurn(-60, 0, up, 60, 18)).toBe(1);
    expect(stickToTurn(60, 0, up, 60, 18)).toBe(-1);
  });
  it('turn scales between deadzone and radius and is quantised to 0.1', () => {
    expect(stickToTurn(0, -39, R, 60, 18)).toBeCloseTo(0.5, 5);
  });
  it('a diagonal stick crawls and turns at once', () => {
    expect(stickToMove(60, -60, R, 60, 18)).toEqual({ direction: 'right', turn: 1 });
    expect(stickToMove(-60, 60, R, 60, 18)).toEqual({ direction: 'left', turn: -1 });
    expect(stickToMove(0, 0, R, 60, 18)).toEqual({ direction: 'stop', turn: 0 });
  });
});
