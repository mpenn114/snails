import {
  computeLaunch,
  predictTrajectory,
  FIXED_DT,
  stepProjectile,
  type ProjectileState,
  type WeaponLaunchSpec,
  type Wind,
} from '@snails/core';
import { describe, expect, it } from 'vitest';

const launch: WeaponLaunchSpec = {
  minSpeed: 8,
  maxSpeed: 30,
  gravityScale: 0.8,
  windScale: 1.5,
  projectileRadius: 0.2,
};
const calm: Wind = { strength: 0, direction: 0 };
const o = { x: 1, y: 2, z: 3 };

describe('predictTrajectory', () => {
  it('starts at the launch spawn point and follows facing', () => {
    const pts = predictTrajectory(o, 0, { angle: 0, power: 1 }, launch, calm, 3);
    expect(pts[0]!.x).toBeCloseTo(1.7);
    expect(pts[1]!.x).toBeGreaterThan(pts[0]!.x);
    expect(pts[1]!.z).toBeCloseTo(3);
  });
  it('more power travels farther', () => {
    const a = predictTrajectory(o, 0, { angle: 0.5, power: 0.2 }, launch, calm);
    const b = predictTrajectory(o, 0, { angle: 0.5, power: 0.9 }, launch, calm);
    expect(b[10]!.x).toBeGreaterThan(a[10]!.x);
  });
  it.each([
    [0, 0.7, 0.3, calm],
    [1.2, 0.4, 1, { strength: 3, direction: 2 }],
    [-2.5, -0.3, 0.6, { strength: 5, direction: 0.5 }],
  ])('matches a core simulation of the same shot (facing %f)', (facing, angle, power, wind) => {
    const aim = { angle, power };
    const pts = predictTrajectory(o, facing, aim, launch, wind, 30, 6);
    const shot = computeLaunch(o, facing, aim, launch);
    let p: ProjectileState = { ...shot, gravityScale: 0.8, windScale: 1.5 };
    for (let i = 0; i < 30 * 6; i++) {
      if (i % 6 === 0) {
        const pt = pts[i / 6]!;
        expect(pt.x).toBeCloseTo(p.position.x, 6);
        expect(pt.y).toBeCloseTo(p.position.y, 6);
        expect(pt.z).toBeCloseTo(p.position.z, 6);
      }
      p = stepProjectile(p, wind, FIXED_DT);
    }
  });
});
