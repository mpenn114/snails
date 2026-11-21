import { describe, expect, it } from 'vitest';
import { CHUNK_SIZE, carveSphere, toCarveEvent } from './carve.js';
import { SdfGrid } from './sdf-grid.js';

/** Chunk id of a cell, mirroring the grid's chunk layout. */
function chunkOf(g: SdfGrid, x: number, y: number, z: number): number {
  const nx = Math.ceil(g.nx / CHUNK_SIZE);
  const ny = Math.ceil(g.ny / CHUNK_SIZE);
  return (
    Math.floor(x / CHUNK_SIZE) +
    nx * (Math.floor(y / CHUNK_SIZE) + ny * Math.floor(z / CHUNK_SIZE))
  );
}

/** Brute-force expected chunks: chunks of changed cells plus face/edge/corner neighbours. */
function expectedChunks(g: SdfGrid, before: Float32Array): number[] {
  const set = new Set<number>();
  for (let z = 0; z < g.nz; z++) {
    for (let y = 0; y < g.ny; y++) {
      for (let x = 0; x < g.nx; x++) {
        const i = g.index(x, y, z);
        if (before[i] === g.data[i]) continue;
        for (const dz of [-1, 0, 1])
          for (const dy of [-1, 0, 1])
            for (const dx of [-1, 0, 1]) {
              const nx = x + dx;
              const ny = y + dy;
              const nz = z + dz;
              if (nx < 0 || ny < 0 || nz < 0 || nx >= g.nx || ny >= g.ny || nz >= g.nz) continue;
              const onBorder =
                (dx === 0 || Math.floor(nx / CHUNK_SIZE) === Math.floor(x / CHUNK_SIZE)) &&
                (dy === 0 || Math.floor(ny / CHUNK_SIZE) === Math.floor(y / CHUNK_SIZE)) &&
                (dz === 0 || Math.floor(nz / CHUNK_SIZE) === Math.floor(z / CHUNK_SIZE));
              if (onBorder) set.add(chunkOf(g, nx, ny, nz));
            }
      }
    }
  }
  return [...set].sort((a, b) => a - b);
}

describe('carveSphere', () => {
  it('turns the centre into air and leaves far cells untouched', () => {
    const g = new SdfGrid(64, 64, 64, 1, -1);
    const far = { x: 60, y: 60, z: 60 };
    carveSphere(g, { x: 10, y: 10, z: 10 }, 3);
    expect(g.sample({ x: 10, y: 10, z: 10 })).toBeGreaterThan(0);
    expect(g.sample(far)).toBeLessThan(0);
    expect(g.data[g.index(60, 60, 60)]).toBe(-1);
  });

  it('reports chunks exactly matching changed cells plus border neighbours', () => {
    const g = new SdfGrid(70, 70, 70, 1, -1);
    const before = g.data.slice();
    // Centre on a chunk boundary (x=32) so neighbours must be included.
    const result = carveSphere(g, { x: 32, y: 32, z: 32 }, 4);
    expect(result.chunks).toEqual(expectedChunks(g, before));
    expect(result.chunks.length).toBeGreaterThan(1);
    expect(result.chunks).toEqual([...result.chunks].sort((a, b) => a - b));
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
