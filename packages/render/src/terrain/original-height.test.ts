import { SdfGrid } from '@snails/core';
import { describe, expect, it } from 'vitest';
import { NO_SURFACE_HEIGHT, buildOriginalHeightMap } from './original-height.js';

function flat(height: number): SdfGrid {
  const g = new SdfGrid(21, 24, 21, 0.5, 1);
  for (let z = 0; z < g.nz; z++)
    for (let y = 0; y < g.ny; y++)
      for (let x = 0; x < g.nx; x++) g.set(x, y, z, y * g.cellSize - height);
  return g;
}

describe('original height map', () => {
  it('records the top surface of every column', () => {
    const m = buildOriginalHeightMap(flat(4));
    expect(m.width).toBe(21);
    expect(m.depth).toBe(21);
    for (const h of m.heights) expect(h).toBeCloseTo(4, 1);
  });

  it('marks all-air columns and is a snapshot unaffected by later carving', () => {
    expect(buildOriginalHeightMap(new SdfGrid(4, 4, 4, 1, 1)).heights[0]).toBe(NO_SURFACE_HEIGHT);
    const g = flat(4);
    const before = buildOriginalHeightMap(g);
    g.carveSphere({ x: 5, y: 4, z: 5 }, 2);
    expect(before.heights[10 * 21 + 10]).toBeCloseTo(4, 1);
    expect(buildOriginalHeightMap(g).heights[10 * 21 + 10]).toBeLessThan(3);
  });
});
