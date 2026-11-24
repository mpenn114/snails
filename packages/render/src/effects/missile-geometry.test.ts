import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { Projectile } from '@snails/core';
import { buildMissileGeometry } from './missile-geometry.js';
import { ProjectileLayer } from './projectile-layer.js';

const missile = (vx: number, vy: number): Projectile =>
  ({
    id: 'm',
    position: { x: 0, y: 5, z: 0 },
    velocity: { x: vx, y: vy, z: 0 },
    ownerSnailId: 's',
    weaponId: 'base:radula-missile',
    radius: 0.2,
    age: 1,
    maxAge: 10,
  }) as unknown as Projectile;

describe('missile view', () => {
  it('is a small flat-shaded mesh with vertex colours along +Z', () => {
    const geo = buildMissileGeometry();
    expect(geo.getAttribute('position').count / 3).toBeLessThan(200);
    expect(geo.getAttribute('color').count).toBe(geo.getAttribute('position').count);
    geo.computeBoundingBox();
    const box = geo.boundingBox as THREE.Box3;
    expect(box.max.z).toBeGreaterThan(1.5);
    expect(box.min.z).toBeLessThan(-1);
  });

  it('points along the velocity without spinning', () => {
    const layer = new ProjectileLayer({ trailLength: 4 });
    layer.sync([missile(6, 8)]);
    const q = layer.get('m')?.pebble.quaternion as THREE.Quaternion;
    const dir = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    expect(dir.x).toBeCloseTo(0.6, 5);
    expect(dir.y).toBeCloseTo(0.8, 5);
    layer.dispose();
  });
});
