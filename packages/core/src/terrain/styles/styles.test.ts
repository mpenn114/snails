import { describe, expect, it } from 'vitest';
import { Rng } from '../../rng.js';
import { DEFAULT_TERRAIN_CONFIG, findSpawnPoints, generateTerrain } from '../generator.js';
import { MAP_SIZE_CELLS } from '../../rules/match-settings.js';
import { TERRAIN_STYLES } from './types.js';

const hash = (d: Float32Array | Uint8Array): number => {
  let h = 2166136261;
  for (const v of d) h = Math.imul(h ^ Math.round(v * 1024), 16777619) >>> 0;
  return h;
};

// Invariants every style must keep: these are what the match rules, spawning and the renderer rely on.
describe.each(TERRAIN_STYLES)('terrain style %s', (style) => {
  const C = { ...DEFAULT_TERRAIN_CONFIG, style };

  it('is deterministic and quick to generate', () => {
    const t0 = Date.now();
    const a = generateTerrain(C, new Rng(11));
    expect(Date.now() - t0).toBeLessThan(1500);
    const b = generateTerrain(C, new Rng(11));
    expect(hash(a.grid.data)).toBe(hash(b.grid.data));
    expect(hash(a.grid.materials)).toBe(hash(b.grid.materials));
  });

  it.each([1, 7, 42])('seed %i: water at the map edges, room for 12 snails', (seed) => {
    const { grid, descriptor } = generateTerrain(C, new Rng(seed));
    const wy = Math.floor(C.waterLevel / C.cellSize) + 1;
    for (let i = 0; i < grid.nx; i++) {
      expect(grid.get(i, wy, 0)).toBeGreaterThan(0);
      expect(grid.get(i, wy, grid.nz - 1)).toBeGreaterThan(0);
      expect(grid.get(0, wy, i)).toBeGreaterThan(0);
      expect(grid.get(grid.nx - 1, wy, i)).toBeGreaterThan(0);
    }
    // Nothing touches the grid ceiling (the mesher would leave an open top).
    for (let z = 0; z < grid.nz; z++) {
      for (let x = 0; x < grid.nx; x++) expect(grid.get(x, grid.ny - 2, z)).toBeGreaterThan(0);
    }
    expect(findSpawnPoints(grid, descriptor, 12, new Rng(seed), 4)).toHaveLength(12);
  });
});

// Bigger arenas keep the same invariants, scale their features and stay quick to generate.
describe.each(TERRAIN_STYLES)('terrain style %s on a huge map', (style) => {
  const n = MAP_SIZE_CELLS.huge;
  const C = { ...DEFAULT_TERRAIN_CONFIG, style, nx: n, nz: n };

  it('is deterministic, quick, walled by water and has room for 32 snails', () => {
    const t0 = Date.now();
    const { grid, descriptor } = generateTerrain(C, new Rng(7));
    expect(Date.now() - t0).toBeLessThan(3000);
    const again = generateTerrain(C, new Rng(7));
    expect(hash(grid.data)).toBe(hash(again.grid.data));
    expect(hash(grid.materials)).toBe(hash(again.grid.materials));
    expect(descriptor).toMatchObject({ nx: n, nz: n });
    const wy = Math.floor(C.waterLevel / C.cellSize) + 1;
    for (let i = 0; i < n; i++) {
      expect(grid.get(i, wy, 0)).toBeGreaterThan(0);
      expect(grid.get(i, wy, n - 1)).toBeGreaterThan(0);
      expect(grid.get(0, wy, i)).toBeGreaterThan(0);
      expect(grid.get(n - 1, wy, i)).toBeGreaterThan(0);
    }
    for (let z = 0; z < n; z++) {
      for (let x = 0; x < n; x++) expect(grid.get(x, grid.ny - 2, z)).toBeGreaterThan(0);
    }
    expect(findSpawnPoints(grid, descriptor, 32, new Rng(7), 4)).toHaveLength(32);
  });

  it('has more dry land than the small map (features scale with the grid)', () => {
    const dry = (nn: number): number => {
      const { grid } = generateTerrain({ ...C, nx: nn, nz: nn }, new Rng(7));
      const wy = Math.ceil(C.waterLevel / C.cellSize) + 2;
      let count = 0;
      for (let z = 0; z < nn; z++) for (let x = 0; x < nn; x++) if (grid.get(x, wy, z) < 0) count++;
      return count;
    };
    expect(dry(n)).toBeGreaterThan(dry(96) * 2.2);
  });
});
