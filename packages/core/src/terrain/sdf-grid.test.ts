import { describe, expect, it } from 'vitest';
import { SdfGrid } from './sdf-grid.js';

function fill(g: SdfGrid, f: (x: number, y: number, z: number) => number): void {
  for (let z = 0; z < g.nz; z++)
    for (let y = 0; y < g.ny; y++) for (let x = 0; x < g.nx; x++) g.set(x, y, z, f(x, y, z));
}

describe('SdfGrid', () => {
  it('carveSphere turns solid into air', () => {
    const g = new SdfGrid(16, 16, 16, 1, -1);
    const c = { x: 8, y: 8, z: 8 };
    expect(g.sample(c)).toBeLessThan(0);
    g.carveSphere(c, 3);
    expect(g.sample(c)).toBeGreaterThan(0);
    expect(g.sample({ x: 1, y: 1, z: 1 })).toBeLessThan(0);
    expect(g.takeDirtyChunks().length).toBeGreaterThan(0);
  });

  it('indexes and out-of-bounds get', () => {
    const g = new SdfGrid(4, 5, 6, 1, -1);
    expect(g.index(1, 2, 3)).toBe(1 + 4 * (2 + 5 * 3));
    g.set(1, 2, 3, 0.5);
    expect(g.get(1, 2, 3)).toBe(0.5);
    expect(g.get(-1, 0, 0)).toBe(1);
    expect(g.get(4, 0, 0)).toBe(1);
    g.set(99, 0, 0, -1);
    expect(g.worldSize()).toEqual({ x: 3, y: 4, z: 5 });
  });

  it('maps chunks and bounds', () => {
    const g = new SdfGrid(40, 16, 20, 1, 1, 16);
    expect([g.chunksX, g.chunksY, g.chunksZ]).toEqual([3, 1, 2]);
    expect(g.chunkIds()).toEqual([0, 1, 2, 3, 4, 5]);
    expect(g.chunkOf(0, 0, 0)).toBe(0);
    expect(g.chunkOf(16, 0, 0)).toBe(1);
    expect(g.chunkOf(39, 15, 19)).toBe(5);
    expect(g.chunkBounds(5)).toEqual({ min: { x: 32, y: 0, z: 16 }, max: { x: 40, y: 16, z: 20 } });
  });

  it('tracks dirty chunks including borders', () => {
    const g = new SdfGrid(32, 32, 32, 1, 1, 16);
    g.set(5, 5, 5, 0);
    expect(g.isDirty(0)).toBe(true);
    expect(g.takeDirtyChunks()).toEqual([0]);
    expect(g.takeDirtyChunks()).toEqual([]);
    g.markCellDirty(16, 5, 5);
    expect(g.takeDirtyChunks()).toEqual([0, 1]);
    g.markCellDirty(16, 16, 16);
    expect(g.takeDirtyChunks()).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    g.markDirty(3);
    expect(g.isDirty(3)).toBe(true);
  });

  it('interpolates trilinearly', () => {
    const g = new SdfGrid(4, 4, 4, 2, 0);
    fill(g, (x, y) => x + 10 * y);
    expect(g.sampleLinear({ x: 2, y: 2, z: 2 })).toBeCloseTo(11);
    expect(g.sampleLinear({ x: 3, y: 1, z: 2 })).toBeCloseTo(6.5);
  });

  it('gradient and normal point away from solid', () => {
    const g = new SdfGrid(16, 16, 16, 1, 0);
    fill(g, (_x, y) => y - 7.5);
    const n = g.normal({ x: 8, y: 7.5, z: 8 });
    expect(n.y).toBeCloseTo(1);
    expect(n.x).toBeCloseTo(0);
    expect(g.isSolid({ x: 8, y: 3, z: 8 })).toBe(true);
    expect(g.isSolid({ x: 8, y: 12, z: 8 })).toBe(false);
    const s = new SdfGrid(16, 16, 16, 1, 0);
    fill(s, (x, y, z) => Math.hypot(x - 8, y - 8, z - 8) - 4);
    expect(s.normal({ x: 12, y: 8, z: 8 }).x).toBeCloseTo(1, 1);
    expect(new SdfGrid(4, 4, 4, 1, 1).normal({ x: 1, y: 1, z: 1 })).toEqual({ x: 0, y: 0, z: 0 });
  });
});
