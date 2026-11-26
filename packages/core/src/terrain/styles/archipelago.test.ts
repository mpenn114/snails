import { describe, expect, it } from 'vitest';
import { Rng } from '../../rng.js';
import { DEFAULT_TERRAIN_CONFIG, generateTerrain } from '../generator.js';
import { MATERIAL_ROCK, MATERIAL_SAND } from '../materials.js';
import type { SdfGrid } from '../sdf-grid.js';

const C = { ...DEFAULT_TERRAIN_CONFIG, style: 'archipelago' as const };

/** Highest solid y (m) of a column, or 0. */
const top = (g: SdfGrid, x: number, z: number): number => {
  for (let y = g.ny - 2; y >= 0; y--) if (g.get(x, y, z) < 0) return y * g.cellSize;
  return 0;
};

/** Sizes of the 4-connected dry landmasses (columns whose top reaches the waterline). */
function landmasses(g: SdfGrid, water: number): number[] {
  const dry = new Uint8Array(g.nx * g.nz);
  for (let z = 0; z < g.nz; z++) {
    for (let x = 0; x < g.nx; x++) dry[z * g.nx + x] = top(g, x, z) > water - 0.05 ? 1 : 0;
  }
  const sizes: number[] = [];
  for (let s = 0; s < dry.length; s++) {
    if (!dry[s]) continue;
    dry[s] = 0;
    const stack = [s];
    let n = 0;
    while (stack.length > 0) {
      const i = stack.pop() as number;
      n++;
      const x = i % g.nx;
      const nb = [i - g.nx, i + g.nx, x > 0 ? i - 1 : -1, x < g.nx - 1 ? i + 1 : -1];
      for (const j of nb) {
        if (j < 0 || j >= dry.length || !dry[j]) continue;
        dry[j] = 0;
        stack.push(j);
      }
    }
    sizes.push(n);
  }
  return sizes.sort((a, b) => b - a);
}

describe('archipelago style', () => {
  it.each([1, 7, 42])('seed %i: several separate islands, one clearly larger', (seed) => {
    const { grid } = generateTerrain(C, new Rng(seed));
    const big = landmasses(grid, C.waterLevel).filter((n) => n >= 40);
    expect(big.length).toBeGreaterThanOrEqual(3);
    expect(big.length).toBeLessThanOrEqual(8);
    expect(big[0] as number).toBeGreaterThan((big[1] as number) * 1.5);
  });

  it.each([1, 7, 42])('seed %i: has sand beaches, rock and a tall sea stack', (seed) => {
    const { grid } = generateTerrain(C, new Rng(seed));
    let sand = 0;
    let rock = 0;
    let stack = 0;
    for (let z = 0; z < grid.nz; z++) {
      for (let x = 0; x < grid.nx; x++) {
        for (let y = 0; y < grid.ny; y++) {
          if (grid.get(x, y, z) >= 0) continue;
          const m = grid.materials[grid.index(x, y, z)];
          if (m === MATERIAL_SAND) sand++;
          if (m === MATERIAL_ROCK && y * grid.cellSize > C.waterLevel) rock++;
        }
        const t = top(grid, x, z);
        // A stack is rock standing well above the water, with the sea floor next to it.
        if (
          t > C.waterLevel + 5 &&
          grid.materials[grid.index(x, Math.round(t / 0.5) - 1, z)] === MATERIAL_ROCK
        ) {
          const e = top(grid, Math.min(grid.nx - 1, x + 6), z);
          if (e < C.waterLevel) stack++;
        }
      }
    }
    expect(sand).toBeGreaterThan(300);
    expect(rock).toBeGreaterThan(300);
    expect(stack).toBeGreaterThan(0);
  });

  it('has a shallow sandbar: columns just below the water between islands', () => {
    const { grid } = generateTerrain(C, new Rng(7));
    let bar = 0;
    for (let z = 0; z < grid.nz; z++) {
      for (let x = 0; x < grid.nx; x++) {
        const t = top(grid, x, z);
        if (t > C.waterLevel - 1 && t <= C.waterLevel) bar++;
      }
    }
    expect(bar).toBeGreaterThan(40);
  });

  it('scales with the grid size', () => {
    const { grid } = generateTerrain({ ...C, nx: 160, nz: 160 }, new Rng(3));
    expect(landmasses(grid, C.waterLevel).filter((n) => n >= 100).length).toBeGreaterThanOrEqual(3);
  });
});
