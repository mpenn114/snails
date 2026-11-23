import { describe, expect, it } from 'vitest';
import { aimTrajectory } from './aim-hint.js';

describe('aimTrajectory', () => {
  const o = { x: 1, y: 2, z: 3 };
  it('starts at the origin and follows facing', () => {
    const pts = aimTrajectory(o, 0, { angle: 0, power: 1 }, { samples: 3 });
    expect(pts[0]).toEqual(o);
    expect(pts[1]!.x).toBeGreaterThan(1);
    expect(pts[1]!.z).toBeCloseTo(3);
  });
  it('rises then falls under gravity', () => {
    const pts = aimTrajectory(o, 0, { angle: Math.PI / 4, power: 0.5 }, { samples: 40 });
    expect(pts[5]!.y).toBeGreaterThan(2);
    expect(pts[39]!.y).toBeLessThan(pts[10]!.y);
  });
  it('more power travels farther', () => {
    const a = aimTrajectory(o, 0, { angle: 0.5, power: 0.2 });
    const b = aimTrajectory(o, 0, { angle: 0.5, power: 0.9 });
    expect(b[10]!.x).toBeGreaterThan(a[10]!.x);
  });
});
