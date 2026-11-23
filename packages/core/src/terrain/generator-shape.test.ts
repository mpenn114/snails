import { describe, expect, it } from 'vitest';
import { Rng } from '../rng.js';
import { DEFAULT_TERRAIN_CONFIG as C, findSpawnPoints, generateTerrain } from './generator.js';
import type { SdfGrid } from './sdf-grid.js';

const dryTop = (grid: SdfGrid, x: number, z: number): number => {
  for (let y = grid.ny - 2; y >= 0; y--) if (grid.get(x, y, z) < 0) return y * grid.cellSize;
  return 0;
};

/** Size of the largest 4-connected set of dry columns. */
function largestComponent(dry: Uint8Array, nx: number): number {
  const seen = new Uint8Array(dry.length);
  let best = 0;
  for (let s = 0; s < dry.length; s++) {
    if (!dry[s] || seen[s]) continue;
    const stack = [s];
    seen[s] = 1;
    let size = 0;
    while (stack.length > 0) {
      const i = stack.pop() as number;
      size++;
      const x = i % nx;
      const nbrs = [i - nx, i + nx];
      if (x > 0) nbrs.push(i - 1);
      if (x < nx - 1) nbrs.push(i + 1);
      for (const j of nbrs) {
        if (j < 0 || j >= dry.length || !dry[j] || seen[j]) continue;
        seen[j] = 1;
        stack.push(j);
      }
    }
    best = Math.max(best, size);
  }
  return best;
}

describe('landmass shape', () => {
  it.each([1, 7, 42])('seed %i: one chunky island, no thin ribbons', (seed) => {
    const { grid } = generateTerrain(C, new Rng(seed));
    const dry = new Uint8Array(grid.nx * grid.nz);
    let total = 0;
    for (let z = 0; z < grid.nz; z++) {
      for (let x = 0; x < grid.nx; x++) {
        if (dryTop(grid, x, z) > C.waterLevel + 0.5) {
          dry[z * grid.nx + x] = 1;
          total++;
        }
      }
    }
    expect(total).toBeGreaterThan(grid.nx * grid.nz * 0.25);
    expect(largestComponent(dry, grid.nx) / total).toBeGreaterThan(0.95);
    // Every dry column has solid rock three metres below its surface (no ribbons or arches).
    for (let z = 0; z < grid.nz; z++) {
      for (let x = 0; x < grid.nx; x++) {
        if (!dry[z * grid.nx + x]) continue;
        const p = { x: x * 0.5, y: dryTop(grid, x, z) - 3, z: z * 0.5 };
        expect(grid.sampleLinear(p)).toBeLessThan(0.5);
      }
    }
  });

  it('offers plenty of spawnable flat ground and some caves', () => {
    const { grid, descriptor } = generateTerrain(C, new Rng(7));
    expect(findSpawnPoints(grid, descriptor, 12, new Rng(1), 5)).toHaveLength(12);
    let voids = 0;
    for (let z = 0; z < grid.nz; z++) {
      for (let x = 0; x < grid.nx; x++) {
        const top = dryTop(grid, x, z);
        for (let y = 4; y < top / 0.5 - 2; y++) if (grid.get(x, y, z) > 0) voids++;
      }
    }
    expect(voids).toBeGreaterThan(50);
  });
});
