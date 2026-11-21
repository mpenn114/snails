import { describe, expect, it } from 'vitest';
import { carveSphere } from './carve.js';
import { collapseFloating, findFloatingClusters, resolveCollapse } from './collapse.js';
import { SdfGrid } from './sdf-grid.js';

/** Air grid with a solid ground slab (y 0..2). */
function ground(n = 24): SdfGrid {
  const g = new SdfGrid(n, n, n, 1, 1);
  for (let z = 0; z < n; z++)
    for (let y = 0; y < 3; y++) for (let x = 0; x < n; x++) g.set(x, y, z, -1);
  return g;
}

function block(g: SdfGrid, x0: number, y0: number, z0: number, s: number, v = -1): void {
  for (let z = z0; z < z0 + s; z++)
    for (let y = y0; y < y0 + s; y++) for (let x = x0; x < x0 + s; x++) g.set(x, y, z, v);
}

describe('collapse', () => {
  it('removes a floating block but leaves ground', () => {
    const g = ground();
    block(g, 8, 8, 8, 3);
    const clusters = findFloatingClusters(g);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]!.cells).toHaveLength(27);
    expect(clusters[0]!.bounds.min).toEqual({ x: 8, y: 8, z: 8 });
    const res = collapseFloating(g, clusters, 'remove');
    expect(res.removedCells).toBe(27);
    expect(res.chunks.length).toBeGreaterThan(0);
    expect(g.get(9, 9, 9)).toBeGreaterThan(0);
    expect(g.get(5, 1, 5)).toBe(-1);
  });

  it('removes a block detached by carving away its support', () => {
    const g = ground();
    block(g, 8, 3, 8, 6); // pillar on the ground
    block(g, 8, 3, 8, 3, 1); // remove the lower part
    block(g, 11, 3, 8, 3, 1);
    block(g, 8, 3, 11, 3, 1);
    block(g, 11, 3, 11, 3, 1);
    const res = resolveCollapse(g, { x: 10, y: 4, z: 10 }, 4, { mode: 'remove' });
    expect(res.removedCells).toBe(216 - 4 * 27);
    expect(g.get(9, 7, 9)).toBeGreaterThan(0);
  });

  it('leaves connected carved terrain untouched', () => {
    const g = ground();
    carveSphere(g, { x: 12, y: 3, z: 12 }, 3);
    expect(resolveCollapse(g, { x: 12, y: 3, z: 12 }, 3).removedCells).toBe(0);
  });

  it('treats clusters reaching outside the region as anchored', () => {
    const g = ground();
    block(g, 8, 8, 8, 3);
    const region = { min: { x: 0, y: 0, z: 0 }, max: { x: 9, y: 20, z: 20 } };
    expect(findFloatingClusters(g, region)).toHaveLength(0);
    const whole = { min: { x: 0, y: 0, z: 0 }, max: { x: 20, y: 20, z: 20 } };
    expect(findFloatingClusters(g, whole)).toHaveLength(1);
  });

  it('is deterministic', () => {
    const run = (): number[][] => {
      const g = ground();
      block(g, 4, 8, 4, 2);
      block(g, 14, 10, 14, 3);
      return findFloatingClusters(g).map((c) => c.cells);
    };
    expect(run()).toEqual(run());
    expect(run()).toHaveLength(2);
  });

  it('handles a 64^3 grid quickly', () => {
    const g = new SdfGrid(64, 64, 64, 1, -1);
    carveSphere(g, { x: 32, y: 32, z: 32 }, 10);
    const t = Date.now();
    expect(findFloatingClusters(g)).toHaveLength(0);
    expect(Date.now() - t).toBeLessThan(5000);
  });
});
