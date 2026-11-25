import { describe, expect, it } from 'vitest';
import { Rng } from '../../rng.js';
import { DEFAULT_TERRAIN_CONFIG, generateTerrain } from '../generator.js';
import { MATERIAL_ROCK } from '../materials.js';

const C = { ...DEFAULT_TERRAIN_CONFIG, style: 'highlands' as const };

/** Highest solid cell height (m) of the grid. */
function peakHeight(seed: number): number {
  const { grid } = generateTerrain(C, new Rng(seed));
  let best = 0;
  for (let z = 0; z < grid.nz; z++) {
    for (let x = 0; x < grid.nx; x++) {
      for (let y = grid.ny - 1; y >= 0; y--) {
        if (grid.get(x, y, z) < 0) {
          best = Math.max(best, y * grid.cellSize);
          break;
        }
      }
    }
  }
  return best;
}

describe('highlands style', () => {
  it.each([1, 3, 7])('seed %i: has a tall peak below the ceiling', (seed) => {
    const h = peakHeight(seed);
    expect(h).toBeGreaterThan(15);
    expect(h).toBeLessThan(C.ny * C.cellSize - 2);
  });

  it.each([1, 3, 7])('seed %i: has a tunnel (void with solid above and below)', (seed) => {
    const { grid } = generateTerrain(C, new Rng(seed));
    const minY = Math.ceil((C.waterLevel + 1) / C.cellSize);
    let found = 0;
    for (let z = 0; z < grid.nz; z++) {
      for (let x = 0; x < grid.nx; x++) {
        for (let y = minY + 3; y < grid.ny - 10; y++) {
          if (grid.get(x, y, z) > 0 && grid.get(x, y - 3, z) < 0 && grid.get(x, y + 5, z) < 0) {
            found++;
          }
        }
      }
    }
    expect(found).toBeGreaterThan(30);
  });

  it('is mostly rock on the high ground', () => {
    const { grid } = generateTerrain(C, new Rng(7));
    let rock = 0;
    let total = 0;
    const y = Math.round(14 / C.cellSize);
    for (let z = 0; z < grid.nz; z++) {
      for (let x = 0; x < grid.nx; x++) {
        if (grid.get(x, y, z) < 0) {
          total++;
          if (grid.materials[grid.index(x, y, z)] === MATERIAL_ROCK) rock++;
        }
      }
    }
    expect(total).toBeGreaterThan(0);
    expect(rock / total).toBeGreaterThan(0.8);
  });
});
