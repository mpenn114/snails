import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { GameSnapshot } from '@snails/core';
import { dampStep, unwrapAngle } from './damping.js';
import { CameraRig } from './camera-rig.js';
import { facingFromVelocity, yawBehindFacing } from './camera-pose.js';

interface Opts {
  projectile?: { x: number; y: number; z: number };
  snailX?: number;
}

function snap(o: Opts = {}): GameSnapshot {
  return {
    terrain: { nx: 100, ny: 40, nz: 100, cellSize: 1, waterLevel: 0 },
    turn: { activeSnailId: 'a' },
    teams: [{ snails: [{ id: 'a', position: { x: o.snailX ?? 10, y: 5, z: 10 }, facing: 0 }] }],
    projectiles: o.projectile
      ? [{ id: 'p', age: 1, position: o.projectile, velocity: { x: 10, y: 0, z: 0 } }]
      : [],
  } as unknown as GameSnapshot;
}

const st = (s: GameSnapshot) => ({ snapshot: s, alpha: 0 });
const mk = (opts = {}) => new CameraRig(new THREE.PerspectiveCamera(60, 1.5), opts);

describe('damping', () => {
  it('converges and is dt independent', () => {
    const a = { value: 0, velocity: 0 };
    const b = { value: 0, velocity: 0 };
    dampStep(a, 10, 0.5, 0.1);
    for (let i = 0; i < 10; i++) dampStep(b, 10, 0.5, 0.01);
    expect(a.value).toBeCloseTo(b.value, 6);
    for (let i = 0; i < 200; i++) dampStep(a, 10, 0.5, 0.05);
    expect(a.value).toBeCloseTo(10, 4);
  });

  it('unwraps angles and ignores zero dt', () => {
    expect(unwrapAngle(0.1 + Math.PI * 2, 0)).toBeCloseTo(0.1);
    const s = { value: 1, velocity: 0 };
    dampStep(s, 5, 1, 0);
    expect(s.value).toBe(1);
  });
});

describe('pose helpers', () => {
  it('computes facing', () => {
    expect(facingFromVelocity(0.1, 0.1)).toBeNull();
    expect(facingFromVelocity(5, 0)).toBeCloseTo(0);
    expect(yawBehindFacing(0)).toBeCloseTo(Math.PI);
  });
});

describe('follow mode', () => {
  it('sits behind the active snail and converges to it', () => {
    const rig = mk();
    const s = snap();
    for (let i = 0; i < 300; i++) rig.update(0.02, st(s));
    const p = rig.pose();
    expect(p.target.x).toBeCloseTo(10, 2);
    expect(p.target.y).toBeCloseTo(5.8, 2);
    expect(rig.camera.position.x).toBeLessThan(10);
  });

  it('is frame-rate independent', () => {
    const a = mk();
    const b = mk();
    a.update(0, st(snap()));
    b.update(0, st(snap()));
    const moved = snap({ snailX: 20 });
    a.update(0.1, st(moved));
    for (let i = 0; i < 10; i++) b.update(0.01, st(moved));
    expect(a.pose().target.x).toBeCloseTo(b.pose().target.x, 3);
  });

  it('switches to the projectile, then the explosion point, then the snail', () => {
    const rig = mk({ explosionHold: 1 });
    rig.update(0, st(snap()));
    const flying = snap({ projectile: { x: 50, y: 20, z: 30 } });
    for (let i = 0; i < 300; i++) rig.update(0.02, st(flying));
    expect(rig.pose().target.x).toBeCloseTo(50, 1);
    for (let i = 0; i < 20; i++) rig.update(0.02, st(snap()));
    expect(rig.pose().target.x).toBeGreaterThan(40);
    for (let i = 0; i < 400; i++) rig.update(0.02, st(snap()));
    expect(rig.pose().target.x).toBeCloseTo(10, 1);
  });

  it('honours a manual target and ground clearance', () => {
    const rig = mk({ heightAt: () => 100, groundClearance: 2 });
    rig.setTarget({ x: 30, y: 1, z: 30 });
    for (let i = 0; i < 300; i++) rig.update(0.02, st(snap()));
    expect(rig.pose().target.x).toBeCloseTo(30, 1);
    expect(rig.camera.position.y).toBeGreaterThanOrEqual(102);
    rig.setTarget(null);
  });
});

describe('free mode', () => {
  it('orbits, pans and zooms with clamping', () => {
    const rig = mk();
    rig.update(0, st(snap()));
    rig.applyInput({ orbitDelta: { x: 1, y: 1 } });
    expect(rig.pose().yaw).toBe(rig.pose().yaw); // ignored outside free mode
    rig.setMode('free');
    const before = rig.pose();
    rig.applyInput({ orbitDelta: { x: 0.5, y: 10 }, panDelta: { x: 3, y: 2 }, zoomDelta: 10 });
    for (let i = 0; i < 300; i++) rig.update(0.02, st(snap()));
    const after = rig.pose();
    expect(after.yaw).toBeCloseTo(before.yaw + 0.5, 2);
    expect(after.pitch).toBeCloseTo(1.45, 2);
    expect(after.distance).toBeCloseTo(400, 1);
    expect(after.target.x).not.toBeCloseTo(before.target.x, 1);
    rig.applyInput({ zoomDelta: -20 });
    for (let i = 0; i < 300; i++) rig.update(0.02, st(snap()));
    expect(rig.pose().distance).toBeCloseTo(3, 1);
  });

  it('keeps the camera inside bounds', () => {
    const rig = mk({ bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 10, z: 10 } } });
    rig.setMode('free');
    rig.applyInput({ panDelta: { x: 500, y: 500 }, zoomDelta: 5 });
    for (let i = 0; i < 200; i++) rig.update(0.02, st(snap()));
    const p = rig.camera.position;
    expect(p.x).toBeLessThanOrEqual(10);
    expect(p.z).toBeLessThanOrEqual(10);
    expect(p.x).toBeGreaterThanOrEqual(0);
  });
});

describe('cinematic mode', () => {
  it('orbits over time', () => {
    const rig = mk({
      mode: 'cinematic',
      shot: { kind: 'orbit', center: { x: 0, y: 0, z: 0 }, distance: 20, pitch: 0.5, rate: 0.5 },
      bounds: { min: { x: -100, y: -100, z: -100 }, max: { x: 100, y: 100, z: 100 } },
    });
    rig.update(0, null);
    const p0 = rig.camera.position.clone();
    for (let i = 0; i < 100; i++) rig.update(0.02, null);
    expect(rig.camera.position.distanceTo(p0)).toBeGreaterThan(2);
  });

  it('pulls back to show the whole map', () => {
    const rig = mk();
    for (let i = 0; i < 10; i++) rig.update(0.02, st(snap()));
    const near = rig.pose().distance;
    rig.setMode('cinematic');
    for (let i = 0; i < 400; i++) rig.update(0.02, st(snap()));
    expect(rig.mode).toBe('cinematic');
    expect(rig.pose().distance).toBeGreaterThan(near * 3);
    rig.setShot({ kind: 'overview', rate: 0 });
  });
});

describe('transitions', () => {
  it('blends rather than jumps', () => {
    const rig = mk();
    for (let i = 0; i < 100; i++) rig.update(0.02, st(snap()));
    const start = rig.camera.position.clone();
    rig.setMode('cinematic');
    rig.update(0.05, st(snap()));
    const early = rig.camera.position.distanceTo(start);
    expect(early).toBeGreaterThan(0);
    for (let i = 0; i < 400; i++) rig.update(0.02, st(snap()));
    const far = rig.camera.position.distanceTo(start);
    expect(early).toBeLessThan(far / 3);
  });

  it('exposes an updater and snap', () => {
    const rig = mk();
    rig.updater(0.016, st(snap()));
    rig.snap();
    rig.setTarget({ x: 70, y: 0, z: 70 });
    rig.updater(0.016, st(snap()));
    expect(rig.pose().target.x).toBe(70);
  });
});
