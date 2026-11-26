import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { GameSnapshot } from '@snails/core';
import { CameraRig } from './camera-rig.js';

function snap(projectile?: { x: number; y: number; z: number }): GameSnapshot {
  return {
    terrain: { nx: 100, ny: 40, nz: 100, cellSize: 1, waterLevel: 0 },
    turn: { activeSnailId: 'a' },
    teams: [{ snails: [{ id: 'a', position: { x: 10, y: 5, z: 10 }, facing: 0 }] }],
    projectiles: projectile
      ? [{ id: 'p', age: 1, position: projectile, velocity: { x: 10, y: 0, z: 0 } }]
      : [],
  } as unknown as GameSnapshot;
}

const st = (s: GameSnapshot) => ({ snapshot: s, alpha: 0 });
const mk = (opts = {}) => new CameraRig(new THREE.PerspectiveCamera(60, 1.5), opts);

describe('occlusion avoidance and eye mode', () => {
  /** Rock for x < 8, behind a snail at x = 10 facing +X. */
  const sdf = (x: number): number => x - 8;

  it('keeps the follow camera out of rock by pulling in', () => {
    const rig = mk({ sdf });
    const s = snap();
    for (let i = 0; i < 300; i++) rig.update(0.02, st(s));
    expect(rig.camera.position.x).toBeGreaterThanOrEqual(8);
    expect(rig.enclosed).toBe(true);
  });

  it('does nothing in open terrain', () => {
    const rig = mk({ sdf: () => 20 });
    const s = snap();
    for (let i = 0; i < 300; i++) rig.update(0.02, st(s));
    expect(rig.pose().distance).toBeCloseTo(9, 1);
    expect(rig.enclosed).toBe(false);
  });

  it('eye mode sits at the snail looking along its facing', () => {
    const rig = mk({ mode: 'eye' });
    const s = snap();
    for (let i = 0; i < 300; i++) rig.update(0.02, st(s));
    const p = rig.camera.position;
    expect(p.x).toBeCloseTo(10.5, 1);
    expect(p.y).toBeCloseTo(5.8, 1);
    const dir = new THREE.Vector3();
    rig.camera.getWorldDirection(dir);
    expect(dir.x).toBeGreaterThan(0.99);
  });

  it('eye mode follows the projectile while a shot is in flight', () => {
    const rig = mk({ mode: 'eye' });
    for (let i = 0; i < 50; i++) rig.update(0.02, st(snap()));
    const flying = snap({ x: 50, y: 20, z: 30 });
    for (let i = 0; i < 400; i++) rig.update(0.02, st(flying));
    expect(rig.pose().target.x).toBeCloseTo(50, 0);
  });
});
