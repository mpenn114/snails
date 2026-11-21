import { describe, expect, it } from 'vitest';
import { carveSphere, toCarveEvent } from './carve.js';
import { SdfGrid } from './sdf-grid.js';

/**
 * Brute-force expected chunks: the chunk of every in-bounds 3x3x3 neighbour of each changed
 * cell. Interior neighbours fall in the cell's own chunk, so this is changed chunks plus borders.
 */
function expectedChunks(g: SdfGrid, before: Float32Array): number[] {
  const set = new Set<number>();
  for (let z = 0; z < g.nz; z++) {
    for (let y = 0; y < g.ny; y++) {
      for (let x = 0; x < g.nx; x++) {
        if (before[g.index(x, y, z)] === g.data[g.index(x, y, z)]) continue;
        for (let dz = -1; dz <= 1; dz++)
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++)
              if (g.inBounds(x + dx, y + dy, z + dz)) set.add(g.chunkOf(x + dx, y + dy, z + dz));
      }
    }
  }
  return [...set].sort((p, q) => p - q);
}

describe('carveSphere', () => {
  it('turns the centre into air and leaves far cells untouched', () => {
    const g = new SdfGrid(64, 64, 64, 1, -1);
    carveSphere(g, { x: 10, y: 10, z: 10 }, 3);
    expect(g.sample({ x: 10, y: 10, z: 10 })).toBeGreaterThan(0);
    expect(g.get(60, 60, 60)).toBe(-1);
  });

  it('reports chunks exactly matching changed cells plus border neighbours', () => {
    const g = new SdfGrid(70, 70, 70, 1, -1);
    const before = g.data.slice();
    // Centre on a chunk boundary (x=16 with default chunk size 16) so neighbours are included.
    const result = carveSphere(g, { x: 16, y: 16, z: 16 }, 4);
    expect(result.chunks).toEqual(expectedChunks(g, before));
    expect(result.chunks.length).toBeGreaterThan(1);
    expect(result.chunks).toEqual([...result.chunks].sort((a, b) => a - b));
    expect(g.takeDirtyChunks()).toEqual(result.chunks);
  });

  it('counts changed cells and removed volume', () => {
    const g = new SdfGrid(16, 16, 16, 2, -1);
    const before = g.data.slice();
    const result = carveSphere(g, { x: 16, y: 16, z: 16 }, 4);
    let changed = 0;
    let becameAir = 0;
    for (let i = 0; i < g.data.length; i++) {
      if (before[i] !== g.data[i]) changed++;
      if ((before[i] ?? 1) < 0 && (g.data[i] ?? 1) >= 0) becameAir++;
    }
    expect(result.cellsChanged).toBe(changed);
    expect(result.cellsChanged).toBeGreaterThan(becameAir);
    expect(result.removedVolume).toBeCloseTo(becameAir * 8);
  });

  it('carving twice in the same place reports no changes the second time', () => {
    const g = new SdfGrid(32, 32, 32, 1, -1);
    const c = { x: 16, y: 16, z: 16 };
    const first = carveSphere(g, c, 5);
    expect(first.cellsChanged).toBeGreaterThan(0);
    const second = carveSphere(g, c, 5);
    expect(second.cellsChanged).toBe(0);
    expect(second.chunks).toEqual([]);
    expect(second.removedVolume).toBe(0);
  });

  it('is a no-op for radius <= 0 and for spheres fully outside the grid', () => {
    const g = new SdfGrid(16, 16, 16, 1, -1);
    const snapshot = g.data.slice();
    for (const r of [0, -2]) {
      expect(carveSphere(g, { x: 8, y: 8, z: 8 }, r)).toEqual({
        chunks: [],
        cellsChanged: 0,
        removedVolume: 0,
      });
    }
    const outside = carveSphere(g, { x: -100, y: 8, z: 8 }, 3);
    expect(outside.cellsChanged).toBe(0);
    expect(g.data).toEqual(snapshot);
  });

  it('builds a plain carve event', () => {
    const centre = { x: 1, y: 2, z: 3 };
    const result = { chunks: [0, 2], cellsChanged: 5, removedVolume: 1 };
    const event = toCarveEvent(centre, 4, result);
    expect(event).toEqual({ centre: { x: 1, y: 2, z: 3 }, radius: 4, chunks: [0, 2] });
    expect(event.centre).not.toBe(centre);
  });
});
