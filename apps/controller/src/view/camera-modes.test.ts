import { describe, expect, it } from 'vitest';
import { CameraModeMachine } from './camera-modes';
import { CameraController } from './camera-controller';
import type { RigLike } from './camera-controller';
import { GestureTracker, zoomFromPinch } from './camera-gestures';
import {
  AIM_MIN_PITCH,
  DEFAULT_AIM_CAMERA,
  aimPose,
  angleDiff,
  applyFreeInput,
  inputToward,
} from './camera-math';

/** Camera world position of an orbit pose (same maths as the render rig). */
function poseCamera(p: {
  target: { x: number; y: number; z: number };
  yaw: number;
  pitch: number;
  distance: number;
}): { x: number; y: number; z: number } {
  const h = Math.cos(p.pitch) * p.distance;
  return {
    x: p.target.x + Math.cos(p.yaw) * h,
    y: p.target.y + Math.sin(p.pitch) * p.distance,
    z: p.target.z + Math.sin(p.yaw) * h,
  };
}

describe('CameraModeMachine', () => {
  it('starts in follow and cycles follow, aim, free, eye', () => {
    const m = new CameraModeMachine();
    expect(m.mode).toBe('follow');
    expect([m.cycle(), m.cycle(), m.cycle(), m.cycle()]).toEqual(['aim', 'free', 'eye', 'follow']);
  });

  it('eye mode is sticky across turns and shots until toggled away', () => {
    const m = new CameraModeMachine();
    m.cycle();
    m.cycle();
    m.cycle();
    expect(m.mode).toBe('eye');
    expect(m.turnStart()).toBe('eye');
    expect(m.setAiming(true)).toBe('aim');
    expect(m.setAiming(false)).toBe('eye');
    expect(m.setProjectileInFlight(true)).toBe('eye');
    m.cycle();
    expect(m.turnStart()).toBe('follow');
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

  it('a latched aim stays after the drag ends and leaves on unlatch', () => {
    const m = new CameraModeMachine();
    expect(m.setAimLatched(true)).toBe('aim');
    m.setAiming(true);
    expect(m.setAiming(false)).toBe('aim');
    expect(m.aimLatched).toBe(true);
    expect(m.setAimLatched(false)).toBe('follow');
  });

  it('unlatching during a drag keeps aim until the drag ends', () => {
    const m = new CameraModeMachine();
    m.setAimLatched(true);
    m.setAiming(true);
    expect(m.setAimLatched(false)).toBe('aim');
    expect(m.setAiming(false)).toBe('follow');
  });

  it('a shot in flight, a gesture and a new turn all drop the latch', () => {
    const m = new CameraModeMachine();
    m.setAimLatched(true);
    expect(m.setProjectileInFlight(true)).toBe('follow');
    expect(m.aimLatched).toBe(false);
    expect(m.setAimLatched(true)).toBe('follow');
    m.turnStart();
    m.setAimLatched(true);
    expect(m.enterFree()).toBe('free');
    expect(m.aimLatched).toBe(false);
    m.setAimLatched(true);
    m.turnStart();
    expect(m.mode).toBe('follow');
    expect(m.aimLatched).toBe(false);
  });

  it('cycling into aim latches it, cycling out clears it', () => {
    const m = new CameraModeMachine();
    m.cycle();
    expect(m.aimLatched).toBe(true);
    m.cycle();
    expect(m.aimLatched).toBe(false);
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

  it('aimPose is an eye-level camera behind the snail looking along its facing', () => {
    const o = DEFAULT_AIM_CAMERA;
    const a = aimPose({ x: 1, y: 2, z: 3 }, 0, 0);
    expect(a.yaw).toBeCloseTo(Math.PI);
    expect(a.pitch).toBeCloseTo(-DEFAULT_AIM_CAMERA.baseLook);
    const cam = poseCamera(a);
    expect(cam.x).toBeCloseTo(1 - o.eyeBack);
    expect(cam.y).toBeCloseTo(2 + o.eyeHeight);
    expect(cam.z).toBeCloseTo(3);
    // The look-at point is ahead of the eye and a little below it.
    expect(a.target.x).toBeGreaterThan(1);
    expect(a.target.y).toBeLessThan(2 + o.eyeHeight);
  });

  it('aimPose looks along the facing, tilted by part of the aim, in any facing', () => {
    const snail = { x: 5, y: 1, z: -2 };
    for (const facing of [0, Math.PI / 2, Math.PI, -1]) {
      for (const angle of [-0.3, 0, 0.5]) {
        const p = aimPose(snail, facing, angle);
        const cam = poseCamera(p);
        const dir = {
          x: p.target.x - cam.x,
          y: p.target.y - cam.y,
          z: p.target.z - cam.z,
        };
        const len = Math.hypot(dir.x, dir.y, dir.z);
        expect(len).toBeCloseTo(p.distance);
        const look = DEFAULT_AIM_CAMERA.baseLook + angle * DEFAULT_AIM_CAMERA.lookGain;
        expect(dir.y / len).toBeCloseTo(Math.sin(look));
        expect(dir.x / len).toBeCloseTo(Math.cos(look) * Math.cos(facing));
        expect(dir.z / len).toBeCloseTo(-Math.cos(look) * Math.sin(facing));
        expect(p.pitch).toBeCloseTo(-look);
      }
    }
  });

  it('aimPose clamps extreme elevations to what the rig can show', () => {
    const steep = { ...DEFAULT_AIM_CAMERA, lookGain: 1 };
    const up = aimPose({ x: 0, y: 0, z: 0 }, 0, Math.PI / 2, steep);
    const down = aimPose({ x: 0, y: 0, z: 0 }, 0, -Math.PI / 2, steep);
    expect(up.pitch).toBeCloseTo(AIM_MIN_PITCH);
    expect(down.pitch).toBeCloseTo(-DEFAULT_AIM_CAMERA.minLook);
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

function fakeRig(): RigLike & { inputs: unknown[]; poses: unknown[]; modes: string[] } {
  const pose = { target: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0.5, distance: 14 };
  const rig = {
    inputs: [] as unknown[],
    poses: [] as unknown[],
    modes: [] as string[],
    mode: 'follow' as 'follow' | 'free' | 'cinematic' | 'eye',
    setMode(m: 'follow' | 'free' | 'cinematic' | 'eye') {
      rig.mode = m;
      rig.modes.push(m);
    },
    setTarget() {},
    pose: () => pose,
    applyInput: (i: unknown) => rig.inputs.push(i),
    setFreePose: (p: unknown) => rig.poses.push(p),
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

  it('aim mode sets the rig free pose to the active snail point of view each frame', () => {
    const rig = fakeRig();
    const c = new CameraController(rig);
    const snap = {
      projectiles: [],
      turn: { activeSnailId: 'a' },
      teams: [
        { snails: [{ id: 'a', position: { x: 1, y: 2, z: 3 }, facing: 0.5, aim: { angle: 0.2 } }] },
      ],
    } as unknown as Parameters<CameraController['onSnapshot']>[0];
    c.onSnapshot(snap);
    c.update();
    expect(rig.poses).toHaveLength(0); // follow mode: the rig tracks by itself
    c.setAimLatched(true);
    c.setLocalAim(0.8);
    c.update();
    expect(rig.mode).toBe('free');
    expect(rig.poses.at(-1)).toEqual(aimPose({ x: 1, y: 2, z: 3 }, 0.5, 0.8));
    c.setAimLatched(false);
    c.update();
    expect(rig.mode).toBe('follow');
  });
});
