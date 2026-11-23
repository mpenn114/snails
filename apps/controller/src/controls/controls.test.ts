import { describe, expect, it, vi } from 'vitest';
import { cameraRightYaw, dragToAim, facingSignFromYaw, screenToWireMove } from './aim-mapping';
import { clampKnob, joystickDirection, onChange } from './joystick';
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
  it('applies deadzone with hysteresis', () => {
    expect(joystickDirection(10, 18)).toBe('stop');
    expect(joystickDirection(20, 18)).toBe('right');
    expect(joystickDirection(-20, 18)).toBe('left');
    expect(joystickDirection(14, 18, 'right')).toBe('right');
    expect(joystickDirection(5, 18, 'right')).toBe('stop');
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

describe('aim mapping', () => {
  it('maps drag to elevation and power', () => {
    expect(dragToAim(2, 2, 1, 100)).toBeNull();
    const up = dragToAim(100, -100, 1, 200);
    expect(up?.angle).toBeCloseTo(Math.PI / 4);
    expect(up?.power).toBeCloseTo(0.707, 2);
    expect(dragToAim(500, 0, 1, 100)?.power).toBe(1);
  });
  it('mirrors for a left-facing snail and handles backward drags', () => {
    expect(dragToAim(-100, -100, -1, 200)?.angle).toBeCloseTo(Math.PI / 4);
    expect(Math.abs(dragToAim(-100, 0, 1, 200)?.angle ?? 0)).toBeCloseTo(Math.PI / 2);
    expect(dragToAim(10, 10, 1, 0)).toBeNull();
  });
  it('derives facing sign', () => {
    expect(facingSignFromYaw(0)).toBe(1);
    expect(facingSignFromYaw(Math.PI)).toBe(-1);
    expect(facingSignFromYaw(Math.PI, Math.PI)).toBe(1);
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
  // Core facing f points along (cos f, -sin f); rig yaw y puts the camera at offset (cos y, sin y).
  it.each([
    [H, 0, 1],
    [H, Math.PI, -1],
    [0, H, 1],
    [0, -H, -1],
    [Math.PI, -H, 1],
    [Math.PI, H, -1],
    [-H, 0, -1],
    [-H, Math.PI, 1],
  ])('camera yaw %f, facing %f -> screen sign %i', (camYaw, facing, expected) => {
    expect(facingSignFromYaw(facing, cameraRightYaw(camYaw))).toBe(expected);
  });
  it('side-on rig yaw has right = +x', () => {
    expect(cameraRightYaw(H)).toBeCloseTo(0);
  });
  it('swaps screen moves only when facing screen-left', () => {
    expect(screenToWireMove('right', 1)).toBe('right');
    expect(screenToWireMove('left', 1)).toBe('left');
    expect(screenToWireMove('right', -1)).toBe('left');
    expect(screenToWireMove('left', -1)).toBe('right');
    expect(screenToWireMove('stop', -1)).toBe('stop');
  });
  it('a drag toward the screen-forward side aims along the facing for either facing', () => {
    expect(dragToAim(50, 0, 1, 100)?.angle).toBeCloseTo(0);
    expect(dragToAim(-50, 0, -1, 100)?.angle).toBeCloseTo(0);
    expect(Math.abs(dragToAim(50, 0, -1, 100)?.angle ?? 0)).toBeCloseTo(H);
  });
});
