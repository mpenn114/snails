import { SdfGrid } from '@snails/core';
import { describe, expect, it } from 'vitest';
import {
  NO_SNOW,
  NO_SURFACE_HEIGHT,
  buildOriginalHeightMap,
  buildWaterHeightMap,
  snowStartFor,
} from './original-height.js';

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

describe('snowStartFor', () => {
  const field = (peak: number, top: number): Float32Array => {
    const h = new Float32Array(1000).fill(4);
    h.fill(peak, 0, top);
    return h;
  };
  it('puts snow 3.2 m under a narrow high summit', () => {
    expect(snowStartFor(field(18, 5))).toBeCloseTo(14.8);
  });
  it('gives broad mesas, low maps and empty maps no snow', () => {
    expect(snowStartFor(field(18, 200))).toBe(NO_SNOW);
    expect(snowStartFor(field(13, 5))).toBe(NO_SNOW);
    expect(snowStartFor(new Float32Array(10).fill(-100))).toBe(NO_SNOW);
  });
});

describe('water height map', () => {
  it('keeps the top of dry land and drops to the floor of a flooded opening under a roof', () => {
    const g = flat(8);
    const plain = buildWaterHeightMap(g, 2);
    expect(plain.heights[10 * 21 + 10]).toBeCloseTo(8, 1);
    // Hollow out a chamber between y = 2 and y = 5 around the centre column, keeping the roof.
    for (let y = 4; y < 10; y++)
      for (let k = 8; k < 13; k++) for (let i = 8; i < 13; i++) g.set(i, y, k, 1);
    const m = buildWaterHeightMap(g, 2);
    expect(m.heights[10 * 21 + 10]).toBeLessThan(2.6);
    expect(m.heights[0]).toBeCloseTo(8, 1);
  });
});
