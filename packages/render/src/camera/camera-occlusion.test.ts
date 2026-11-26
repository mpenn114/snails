import { describe, expect, it } from 'vitest';
import { eyePose, freeDistance, pullOutOfRock, resolveOcclusion } from './camera-occlusion.js';
import { poseToPosition, type CameraPose } from './camera-pose.js';

/** Open air except rock for x < wallX. */
const wall = (wallX: number) => (x: number) => x - wallX;

/** A horizontal tunnel along X: air for |y - 5| < 1.2 and |z| < 1.5, rock elsewhere. */
const tunnel = (_x: number, y: number, z: number) =>
  Math.min(1.2 - Math.abs(y - 5), 1.5 - Math.abs(z));

const pose = (over: Partial<CameraPose> = {}): CameraPose => ({
  target: { x: 0, y: 5, z: 0 },
  yaw: 0,
  pitch: 0.45,
  distance: 9,
  ...over,
});

describe('freeDistance', () => {
  it('returns the full length in open air and stops before rock', () => {
    const dir = { x: 1, y: 0, z: 0 };
    expect(freeDistance(() => 5, { x: 0, y: 0, z: 0 }, dir, 8, 0.7, 0.3)).toBe(8);
    const d = freeDistance((x) => 4 - x, { x: 0, y: 0, z: 0 }, dir, 8, 0.7, 0.3);
    expect(d).toBeGreaterThan(2.5);
    expect(d).toBeLessThanOrEqual(3.3);
  });
});

describe('resolveOcclusion', () => {
  it('leaves an unobstructed pose alone', () => {
    const r = resolveOcclusion(pose(), () => 10);
    expect(r.pose).toEqual(pose());
    expect(r.enclosed).toBe(false);
  });

  it('raises pitch to look over a low obstacle', () => {
    // A wall behind the snail (x > 3) that only reaches y = 6: a raised camera clears it.
    const sdf = (x: number, y: number) => (x > 3 ? 6 - y : 10);
    const r = resolveOcclusion(pose({ pitch: 0.2 }), sdf);
    expect(r.pose.pitch).toBeGreaterThan(0.2);
    expect(r.pose.distance).toBeGreaterThan(4);
  });

  it('pulls in along the line when no pitch clears (tunnel) and flags enclosed', () => {
    const r = resolveOcclusion(pose({ yaw: Math.PI, distance: 9 }), tunnel);
    expect(r.pose.distance).toBeLessThan(7);
    expect(r.pose.distance).toBeGreaterThanOrEqual(0.9);
    expect(r.enclosed).toBe(true);
    const pos = poseToPosition(r.pose);
    expect(tunnel(pos.x, pos.y, pos.z)).toBeGreaterThan(0);
  });

  it('never goes below the minimum distance', () => {
    const r = resolveOcclusion(pose({ distance: 2 }), () => -1, { minDistance: 0.9 });
    expect(r.pose.distance).toBeCloseTo(0.9);
  });
});

describe('pullOutOfRock', () => {
  it('keeps free positions and slides buried ones back toward the target', () => {
    const free = { x: 12, y: 0, z: 0 };
    expect(pullOutOfRock({ x: 10, y: 0, z: 0 }, free, wall(0))).toBe(free);
    const buried = pullOutOfRock({ x: 10, y: 0, z: 0 }, { x: -5, y: 0, z: 0 }, wall(0));
    expect(buried.x).toBeGreaterThan(0);
    expect(buried.x).toBeLessThan(2);
  });

  it('ignores a target that is itself in rock', () => {
    const p = { x: -5, y: 0, z: 0 };
    expect(pullOutOfRock({ x: -1, y: 0, z: 0 }, p, wall(0))).toBe(p);
  });
});

describe('eyePose', () => {
  it('puts the camera just ahead of the snail looking along its facing', () => {
    const yaw = Math.PI; // facing +X
    const p = { x: 3, y: 2, z: 4 };
    const pos = poseToPosition(eyePose(p, yaw));
    expect(pos.x).toBeCloseTo(3.5, 2);
    expect(pos.y).toBeCloseTo(2, 2);
    expect(pos.z).toBeCloseTo(4, 2);
    expect(eyePose(p, yaw).target.x).toBeGreaterThan(pos.x);
  });
});
