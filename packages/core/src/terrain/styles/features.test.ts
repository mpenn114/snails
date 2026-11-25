import { describe, expect, it } from 'vitest';
import { Rng } from '../../rng.js';
import { buildTunnel, segmentDistance, tunnelCarve, wobblyPath } from './features.js';

const A = { x: 0, y: 5, z: 0 };
const B = { x: 20, y: 5, z: 0 };

describe('tunnel features', () => {
  it('measures distance to a segment, clamping at its ends', () => {
    expect(segmentDistance(A, B, 10, 8, 0)).toBeCloseTo(3);
    expect(segmentDistance(A, B, -3, 5, 4)).toBeCloseTo(5);
  });

  it('carves positive inside the radius and negative outside', () => {
    const t = buildTunnel([A, B], 2);
    expect(tunnelCarve(t, 10, 5, 0)).toBeCloseTo(2);
    expect(tunnelCarve(t, 10, 6, 0)).toBeCloseTo(1);
    expect(tunnelCarve(t, 10, 7.5, 0)).toBeLessThan(0);
    expect(tunnelCarve(t, 10, 20, 0)).toBe(-Infinity);
  });

  it('builds a wobbly path hitting both endpoints deterministically', () => {
    const p = wobblyPath(new Rng(5), A, B, { segments: 6 });
    expect(p).toHaveLength(7);
    expect(p[0]).toEqual(A);
    expect(p[6]).toEqual(B);
    expect(p).toEqual(wobblyPath(new Rng(5), A, B, { segments: 6 }));
    expect(p.some((q) => Math.abs(q.z) > 0.05)).toBe(true);
    const t = buildTunnel(p, 1.8);
    for (const q of p) expect(tunnelCarve(t, q.x, q.y, q.z)).toBeCloseTo(1.8);
  });
});
