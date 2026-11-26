import { describe, expect, it } from 'vitest';
import { Rng } from '../../rng.js';
import { DEFAULT_TERRAIN_CONFIG, generateTerrain } from '../generator.js';
import type { SdfGrid } from '../sdf-grid.js';
import { MATERIAL_CLAY, MATERIAL_ROCK } from '../materials.js';

// The raw style, without the reachability pass that adds ramps (see reachability.test.ts).
const C = { ...DEFAULT_TERRAIN_CONFIG, style: 'canyon' as const, connect: false };
const SEEDS = [1, 3, 7];

/** Highest solid cell index of column (x, z) (clamped to the grid), or -1. */
function topOf(g: SdfGrid, x: number, z: number): number {
  const cx = Math.min(g.nx - 1, Math.max(0, x));
  const cz = Math.min(g.nz - 1, Math.max(0, z));
  for (let y = g.ny - 1; y >= 0; y--) if (g.get(cx, y, cz) < 0) return y;
  return -1;
}

describe('canyon style', () => {
  it.each(SEEDS)('seed %i: a deep low strip crosses the island', (seed) => {
    const { grid } = generateTerrain(C, new Rng(seed));
    const cs = grid.cellSize;
    const r = Math.round(6 / cs);
    const hi = (x: number, z: number): boolean => topOf(grid, x, z) * cs > 11;
    let high = 0;
    let deep = 0;
    for (let z = 0; z < grid.nz; z++) {
      for (let x = 0; x < grid.nx; x++) {
        const t = topOf(grid, x, z) * cs;
        if (t > 12) high++;
        const low = t > 3 && t < 7;
        if (low && ((hi(x + r, z) && hi(x - r, z)) || (hi(x, z + r) && hi(x, z - r)))) deep++;
      }
    }
    expect(high).toBeGreaterThan(grid.nx * grid.nz * 0.2);
    expect(deep).toBeGreaterThan(60);
  });

  it.each(SEEDS)('seed %i: a rock bridge spans the gorge', (seed) => {
    const { grid } = generateTerrain(C, new Rng(seed));
    const cs = grid.cellSize;
    const floorY = Math.ceil((C.waterLevel + 1.5) / cs);
    let found = 0;
    for (let z = 0; z < grid.nz; z++) {
      for (let x = 0; x < grid.nx; x++) {
        // solid floor, void above it, then solid roof (the bridge) with the tableland over it
        if (grid.get(x, floorY - 3, z) < 0 && grid.get(x, floorY + 2, z) > 0) {
          for (let y = floorY + 4; y < Math.round(13 / cs); y++) {
            if (grid.get(x, y, z) < 0 && grid.get(x, y - 2, z) > 0) {
              found++;
              break;
            }
          }
        }
      }
    }
    expect(found).toBeGreaterThan(8);
  });

  it.each(SEEDS)('seed %i: walls have standable ledges', (seed) => {
    const { grid } = generateTerrain(C, new Rng(seed));
    const cs = grid.cellSize;
    let ledges = 0;
    for (let z = 1; z < grid.nz - 1; z++) {
      for (let x = 1; x < grid.nx - 1; x++) {
        const t = topOf(grid, x, z) * cs;
        // A flat mid-height surface with a deeper drop on one side and a wall on the other.
        if (t > 6.5 && t < 12 && topOf(grid, x + 1, z) === topOf(grid, x, z)) {
          const near = [
            topOf(grid, x - 3, z),
            topOf(grid, x + 3, z),
            topOf(grid, x, z - 3),
            topOf(grid, x, z + 3),
          ];
          if (near.some((n) => n * cs < t - 1.5) && near.some((n) => n * cs > t + 1.5)) ledges++;
        }
      }
    }
    expect(ledges).toBeGreaterThan(20);
  });

  it('strata alternate between rock and clay in the walls', () => {
    const { grid } = generateTerrain(C, new Rng(7));
    const cs = grid.cellSize;
    let flips = 0;
    let best = 0;
    for (let z = 0; z < grid.nz; z++) {
      for (let x = 0; x < grid.nx; x++) {
        let n = 0;
        let last = -1;
        for (let y = Math.round(6 / cs); y < Math.round(13 / cs); y++) {
          if (grid.get(x, y, z) >= 0) continue;
          const m = grid.materials[grid.index(x, y, z)] as number;
          if (m !== MATERIAL_ROCK && m !== MATERIAL_CLAY) continue;
          if (last !== -1 && m !== last) n++;
          last = m;
        }
        best = Math.max(best, n);
        flips += n;
      }
    }
    expect(best).toBeGreaterThanOrEqual(2);
    expect(flips).toBeGreaterThan(200);
  });
});
