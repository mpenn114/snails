import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { MAX_TILT, dampTilt, groundNormalAt, tiltQuaternion } from './terrain-tilt.js';

const up = { x: 0, y: 1, z: 0 };
const angleOf = (q: THREE.Quaternion): number => 2 * Math.acos(Math.min(1, Math.abs(q.w)));
const upOf = (q: THREE.Quaternion): THREE.Vector3 => new THREE.Vector3(0, 1, 0).applyQuaternion(q);

describe('terrain tilt', () => {
  it('flat ground gives identity', () => {
    expect(groundNormalAt(() => up, { x: 1, y: 2, z: 3 }).toArray()).toEqual([0, 1, 0]);
    expect(angleOf(tiltQuaternion(up))).toBeCloseTo(0);
    expect(angleOf(tiltQuaternion(null))).toBe(0);
  });

  it('a 30 degree slope tilts the local up onto the normal', () => {
    const a = (30 * Math.PI) / 180;
    const n = { x: -Math.sin(a), y: Math.cos(a), z: 0 };
    const q = tiltQuaternion(n);
    expect(angleOf(q)).toBeCloseTo(a);
    const u = upOf(q);
    expect(u.x).toBeCloseTo(n.x);
    expect(u.y).toBeCloseTo(n.y);
  });

  it('clamps steep slopes to the maximum tilt', () => {
    const q = tiltQuaternion({ x: 1, y: 0, z: 0 });
    expect(angleOf(q)).toBeCloseTo(MAX_TILT);
    expect(upOf(q).x).toBeGreaterThan(0);
  });

  it('averages samples around the foot and falls back to up when they cancel', () => {
    const noisy = (p: { x: number }): { x: number; y: number; z: number } =>
      p.x > 0.1 ? { x: 1, y: 0, z: 0 } : up;
    const n = groundNormalAt(noisy, { x: 0, y: 0, z: 0 });
    expect(n.length()).toBeCloseTo(1);
    expect(n.x).toBeGreaterThan(0);
    expect(n.x).toBeLessThan(0.5);
    const zero = groundNormalAt(() => ({ x: 0, y: 0, z: 0 }), { x: 0, y: 0, z: 0 });
    expect(zero.toArray()).toEqual([0, 1, 0]);
  });

  it('damping is frame-rate independent and converges', () => {
    const target = tiltQuaternion({ x: -0.5, y: 0.866, z: 0 });
    const a = new THREE.Quaternion();
    const b = new THREE.Quaternion();
    for (let i = 0; i < 10; i++) dampTilt(a, target, 0.1);
    for (let i = 0; i < 100; i++) dampTilt(b, target, 0.01);
    expect(a.angleTo(b)).toBeLessThan(1e-3);
    for (let i = 0; i < 100; i++) dampTilt(a, target, 0.1);
    expect(a.angleTo(target)).toBeLessThan(1e-4);
    const c = new THREE.Quaternion();
    dampTilt(c, target, 0);
    expect(angleOf(c)).toBe(0);
  });
});
