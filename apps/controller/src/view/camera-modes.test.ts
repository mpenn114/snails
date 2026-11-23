import { describe, expect, it } from 'vitest';
import { CameraModeMachine } from './camera-modes';
import { CameraController } from './camera-controller';
import type { RigLike } from './camera-controller';
import { GestureTracker, zoomFromPinch } from './camera-gestures';
import { aimPose, angleDiff, applyFreeInput, inputToward } from './camera-math';

describe('CameraModeMachine', () => {
  it('starts in follow and cycles follow, aim, free', () => {
    const m = new CameraModeMachine();
    expect(m.mode).toBe('follow');
    expect([m.cycle(), m.cycle(), m.cycle()]).toEqual(['aim', 'free', 'follow']);
  });

  it('turnStart leaves free for follow', () => {
    const m = new CameraModeMachine();
    m.enterFree();
    expect(m.turnStart()).toBe('follow');
  });

  it('aiming toggles aim and back to follow', () => {
    const m = new CameraModeMachine();
    expect(m.setAiming(true)).toBe('aim');
    expect(m.setAiming(false)).toBe('follow');
  });

  it('a projectile forces follow once, even while aiming, and does not fight a later manual choice', () => {
    const m = new CameraModeMachine();
    m.setAiming(true);
    expect(m.setProjectileInFlight(true)).toBe('follow');
    m.enterFree();
    expect(m.setProjectileInFlight(true)).toBe('free');
    m.setProjectileInFlight(false);
    expect(m.mode).toBe('free');
  });

  it('does not re-enter aim while a shot is in flight', () => {
    const m = new CameraModeMachine();
    m.setProjectileInFlight(true);
    expect(m.setAiming(true)).toBe('follow');
  });

  it('turnStart while aiming goes straight to aim', () => {
    const m = new CameraModeMachine();
    m.setAiming(true);
    m.setProjectileInFlight(true);
    expect(m.turnStart()).toBe('aim');
  });
});

describe('camera maths', () => {
  it('angleDiff takes the short way round', () => {
    expect(angleDiff(3, -3)).toBeCloseTo(2 * Math.PI - 6);
    expect(angleDiff(0, 1)).toBe(1);
  });

  it('aimPose sits behind the facing and tilts with elevation', () => {
    const a = aimPose({ x: 1, y: 2, z: 3 }, 0, 0);
    const b = aimPose({ x: 1, y: 2, z: 3 }, 0, 0.5);
    expect(a.yaw).toBeCloseTo(Math.PI);
    expect(a.target.y).toBeGreaterThan(2);
    expect(b.pitch).toBeGreaterThan(a.pitch);
  });

  it('inputToward is the inverse of applyFreeInput', () => {
    const from = { target: { x: 1, y: 0, z: 2 }, yaw: 0.3, pitch: 0.4, distance: 10 };
    const to = { target: { x: 7, y: 0, z: -3 }, yaw: 2.0, pitch: 0.7, distance: 6 };
    const got = applyFreeInput(from, inputToward(from, to));
    expect(got.target.x).toBeCloseTo(7);
    expect(got.target.z).toBeCloseTo(-3);
    expect(got.yaw).toBeCloseTo(2.0);
    expect(got.pitch).toBeCloseTo(0.7);
    expect(got.distance).toBeCloseTo(6);
  });
});

describe('GestureTracker', () => {
  it('one pointer orbits', () => {
    const g = new GestureTracker(() => 10);
    g.down(1, 0, 0);
    const i = g.move(1, 10, 5);
    expect(i?.orbitDelta?.x).toBeLessThan(0);
    expect(i?.orbitDelta?.y).toBeGreaterThan(0);
    expect(g.move(9, 0, 0)).toBeNull();
  });

  it('two pointers pinch-zoom and pan', () => {
    const g = new GestureTracker(() => 10);
    g.down(1, 0, 0);
    g.down(2, 100, 0);
    const i = g.move(2, 200, 0);
    expect(i?.zoomDelta).toBeLessThan(0);
    expect(i?.panDelta?.x).toBeCloseTo(-50 * 0.0015 * 10);
    g.up(2);
    expect(g.active).toBe(1);
  });

  it('zoomFromPinch ignores degenerate spans', () => {
    expect(zoomFromPinch(0, 5)).toBe(0);
  });
});

function fakeRig(): RigLike & { inputs: unknown[]; modes: string[] } {
  const pose = { target: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0.5, distance: 14 };
  const rig = {
    inputs: [] as unknown[],
    modes: [] as string[],
    mode: 'follow' as 'follow' | 'free' | 'cinematic',
    setMode(m: 'follow' | 'free' | 'cinematic') {
      rig.mode = m;
      rig.modes.push(m);
    },
    setTarget() {},
    pose: () => pose,
    applyInput: (i: unknown) => rig.inputs.push(i),
  };
  return rig;
}

describe('CameraController', () => {
  it('gestures and cycling switch the rig mode; turnStart restores follow', () => {
    const rig = fakeRig();
    const c = new CameraController(rig);
    const seen: string[] = [];
    c.onModeChange((m) => seen.push(m));
    c.update();
    c.gesture({ orbitDelta: { x: 0.1, y: 0 } });
    expect(rig.modes).toEqual(['follow', 'free']);
    expect(rig.inputs).toHaveLength(1);
    c.turnStart();
    c.update();
    expect(rig.modes.at(-1)).toBe('follow');
    expect(seen).toEqual(['free', 'follow']);
  });

  it('jumpTo pans the free camera onto the point', () => {
    const rig = fakeRig();
    const c = new CameraController(rig);
    c.jumpTo(10, 5);
    expect(rig.mode).toBe('free');
    const input = rig.inputs[0] as { panDelta: { x: number; y: number } };
    // yaw 0: right=(0,1), forward=(-1,0)
    expect(input.panDelta.x).toBeCloseTo(5);
    expect(input.panDelta.y).toBeCloseTo(-10);
  });
});
