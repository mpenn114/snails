import { SdfGrid } from '@snails/core';
import { describe, expect, it } from 'vitest';
import {
  AVOID_RADIUS,
  MIN_NORMAL_Y,
  PROP_KINDS,
  hasGround,
  planProps,
  seedFromGrid,
  surfaceHeight,
} from './prop-plan.js';

/** Flat ground at `height` metres over a 30 x 30 m area (cell 0.5). */
function flatGrid(height = 4): SdfGrid {
  const g = new SdfGrid(61, 24, 61, 0.5, 1);
  for (let z = 0; z < g.nz; z++)
    for (let y = 0; y < g.ny; y++)
      for (let x = 0; x < g.nx; x++) g.set(x, y, z, y * g.cellSize - height);
  g.takeDirtyChunks();
  return g;
}

describe('surfaceHeight', () => {
  it('finds the top of flat ground and null over empty space', () => {
    const g = flatGrid(4);
    expect(surfaceHeight(g, 10, 10)).toBeCloseTo(4, 1);
    expect(surfaceHeight(new SdfGrid(8, 8, 8, 1, 1), 2, 2)).toBeNull();
  });
});

describe('planProps', () => {
  it('is deterministic for a seed and differs across seeds', () => {
    const g = flatGrid();
    const a = planProps({ grid: g, seed: 5, count: 60, waterLevel: 1 });
    const b = planProps({ grid: g, seed: 5, count: 60, waterLevel: 1 });
    const c = planProps({ grid: g, seed: 6, count: 60, waterLevel: 1 });
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    expect(a).toHaveLength(60);
  });

  it('places props on the surface, inside the map, with valid kinds', () => {
    const g = flatGrid();
    for (const p of planProps({ grid: g, seed: 1, count: 80, waterLevel: 1 })) {
      expect(p.y).toBeCloseTo(4, 1);
      expect(p.x).toBeGreaterThan(0.99);
      expect(p.x).toBeLessThan(g.worldSize().x - 0.99);
      expect(p.kind).toBeGreaterThanOrEqual(0);
      expect(p.kind).toBeLessThan(PROP_KINDS.length);
      expect(p.normal.y).toBeGreaterThanOrEqual(MIN_NORMAL_Y);
    }
  });

  it('keeps clear of avoid points', () => {
    const g = flatGrid();
    const avoid = [{ x: 15, y: 4, z: 15 }];
    const plan = planProps({ grid: g, seed: 2, count: 200, waterLevel: 1, avoid });
    for (const p of plan) {
      expect(Math.hypot(p.x - 15, p.y - 4, p.z - 15)).toBeGreaterThanOrEqual(AVOID_RADIUS);
    }
  });

  it('places nothing under water', () => {
    expect(planProps({ grid: flatGrid(4), seed: 1, count: 20, waterLevel: 6 })).toHaveLength(0);
  });

  it('rejects steep walls', () => {
    const g = new SdfGrid(41, 40, 61, 0.5, 1);
    for (let z = 0; z < g.nz; z++)
      for (let y = 0; y < g.ny; y++)
        for (let x = 0; x < g.nx; x++) g.set(x, y, z, (y - x) * 0.5 + 2);
    expect(planProps({ grid: g, seed: 3, count: 40, waterLevel: 0 })).toHaveLength(0);
  });
});

describe('hasGround and seedFromGrid', () => {
  it('turns false once the ground under a prop is carved away', () => {
    const g = flatGrid();
    const p = { x: 15, y: 4, z: 15 };
    expect(hasGround(g, p)).toBe(true);
    g.carveSphere({ x: 15, y: 4, z: 15 }, 2);
    expect(hasGround(g, p)).toBe(false);
    expect(hasGround(g, { x: 3, y: 4, z: 3 })).toBe(true);
  });

  it('hashes the terrain contents', () => {
    const before = seedFromGrid(flatGrid());
    expect(seedFromGrid(flatGrid())).toBe(before);
    expect(seedFromGrid(flatGrid(6))).not.toBe(before);
  });
});
