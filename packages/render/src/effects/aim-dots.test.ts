import { describe, expect, it } from 'vitest';
import { dotRadius, layoutDots } from './aim-dots.js';
import { chunkCount, createChunkPool } from './chunk-pool.js';
import { PEBBLE_TRIANGLES, buildPebbleGeometry, pebbleJitter } from './pebble-geometry.js';
import { createTrailState, emitTrail } from './trail-emitter.js';

const line = [
  { x: 0, y: 0, z: 0 },
  { x: 4, y: 0, z: 0 },
  { x: 8, y: 0, z: 0 },
];

describe('layoutDots', () => {
  it('spaces dots evenly and reports u along the arc', () => {
    const out = new Float32Array(64);
    const l = layoutDots(line, 1, 0, 1, 16, out);
    expect(l.length).toBeCloseTo(8);
    expect(l.impact).toBeNull();
    expect(l.count).toBe(8);
    expect(out[0]).toBeCloseTo(1);
    expect(out[4]).toBeCloseTo(2);
    expect(out[3]).toBeCloseTo(1 / 8);
  });
  it('phase shifts the dots and maxDots caps the count', () => {
    const out = new Float32Array(16);
    const l = layoutDots(line, 1, 0.5, 0, 3, out);
    expect(l.count).toBe(3);
    expect(out[0]).toBeCloseTo(0.5);
  });
  it('stops at terrain and refines the impact point', () => {
    const out = new Float32Array(64);
    const l = layoutDots(line, 1, 0, 1, 16, out, (p) => p.x >= 5.5);
    expect(l.impact?.x).toBeCloseTo(5.5, 1);
    expect(l.length).toBeCloseTo(5.5, 1);
    expect(l.count).toBe(5);
  });
  it('returns nothing for a degenerate path', () => {
    expect(layoutDots([], 1, 0, 0, 4, new Float32Array(16)).count).toBe(0);
    expect(layoutDots([{ x: 0, y: 0, z: 0 }], 1, 0, 0, 4, new Float32Array(16)).count).toBe(0);
  });
  it('dots grow towards the target', () => {
    expect(dotRadius(1)).toBeGreaterThan(dotRadius(0));
  });
});

describe('pebble geometry', () => {
  it('is a chunky low-poly mesh within the projectile budget', () => {
    const g = buildPebbleGeometry();
    expect(g.getAttribute('position').count / 3).toBe(PEBBLE_TRIANGLES);
    expect(PEBBLE_TRIANGLES).toBeLessThanOrEqual(120);
    g.computeBoundingSphere();
    expect(g.boundingSphere?.radius).toBeGreaterThan(0.8);
    expect(g.boundingSphere?.radius).toBeLessThan(1.3);
    expect(g.getAttribute('color').count).toBe(g.getAttribute('position').count);
  });
  it('jitter is deterministic and bounded', () => {
    expect(pebbleJitter(0.3, 0.4, 0.5)).toBe(pebbleJitter(0.3, 0.4, 0.5));
    expect(Math.abs(pebbleJitter(1, 2, 3) - 1)).toBeLessThanOrEqual(0.14);
  });
});

describe('emitTrail', () => {
  const spec = { spacing: 0.5, size: 0.1, life: 1, colour: 0xffffff };
  it('spaces puffs along the path without gaps', () => {
    const pool = createChunkPool(32);
    const st = createTrailState();
    expect(emitTrail(pool, st, 0, 0, 0, spec)).toBe(0);
    expect(emitTrail(pool, st, 2, 0, 0, spec)).toBe(4);
    expect(pool.pos[0]).toBeCloseTo(0.5);
    expect(emitTrail(pool, st, 2.3, 0, 0, spec)).toBe(0);
    expect(emitTrail(pool, st, 2.6, 0, 0, spec)).toBe(1);
    expect(chunkCount(pool)).toBe(5);
  });
  it('caps puffs per call', () => {
    const pool = createChunkPool(64);
    const st = createTrailState();
    emitTrail(pool, st, 0, 0, 0, spec);
    expect(emitTrail(pool, st, 100, 0, 0, spec)).toBe(8);
  });
});
