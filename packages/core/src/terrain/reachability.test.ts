import { describe, expect, it } from 'vitest';
import { Rng } from '../rng.js';
import { MAP_SIZE_CELLS, type MapSize } from '../rules/match-settings.js';
import { largestRegion } from './connect.js';
import { DEFAULT_TERRAIN_CONFIG, findSpawnPoints, generateTerrain } from './generator.js';
import {
  analyzeReachability,
  groundIsOpen,
  reachableFraction,
  startComponents,
} from './reachability.js';
import { SdfGrid } from './sdf-grid.js';
import { TERRAIN_STYLES } from './styles/types.js';

const WATER = 2;

/** A 20 m x 12 m x 20 m test grid whose ground height is `height(x, z)` metres. */
function heightfield(height: (x: number, z: number) => number): SdfGrid {
  const g = new SdfGrid(40, 24, 40, 0.5);
  for (let z = 0; z < g.nz; z++) {
    for (let x = 0; x < g.nx; x++) {
      const h = height(x * 0.5, z * 0.5);
      for (let y = 0; y < g.ny; y++)
        g.data[g.index(x, y, z)] = Math.max(-2, Math.min(2, y * 0.5 - h));
    }
  }
  return g;
}

/** Number of standable regions of at least 2 m^2. */
const regions = (g: SdfGrid): number =>
  [...analyzeReachability(g, WATER).compArea].filter((a) => a >= 2).length;

describe('analyzeReachability', () => {
  it('treats gentle ground as one region', () => {
    expect(regions(heightfield((x) => 4 + 0.1 * x))).toBe(1);
  });

  it('joins ledges a snail can step or jump but not cliffs', () => {
    const ledge = (rise: number) => heightfield((x) => (x < 10 ? 4 : 4 + rise));
    expect(regions(ledge(0.3))).toBe(1);
    expect(regions(ledge(0.7))).toBe(1);
    expect(regions(ledge(1.6))).toBe(2);
    expect(regions(ledge(4))).toBe(2);
  });

  it('joins small gaps but not wide ones', () => {
    const trench = (w: number) => heightfield((x) => (x > 10 && x < 10 + w ? 0 : 4));
    expect(regions(trench(0.5))).toBe(1);
    expect(regions(trench(4))).toBe(2);
  });

  it('ignores ground under water and under low ceilings', () => {
    expect(regions(heightfield(() => 1.5))).toBe(0);
    const roofed = heightfield(() => 4);
    for (let z = 0; z < roofed.nz; z++) {
      for (let x = 0; x < roofed.nx; x++) {
        for (let y = 10; y < roofed.ny; y++) roofed.data[roofed.index(x, y, z)] = -1;
      }
    }
    expect(regions(roofed)).toBe(0);
  });

  it('counts a ramp as a link', () => {
    const steep = heightfield((x) => (x < 10 ? 4 : x > 14 ? 8 : 4 + (x - 10)));
    expect(regions(steep)).toBe(1);
  });
});

describe('groundIsOpen', () => {
  it('accepts big regions and rejects islets', () => {
    const g = heightfield((x, z) => (Math.hypot(x - 15, z - 15) < 1.2 ? 8 : 4));
    expect(groundIsOpen(g, WATER, { x: 5, y: 4, z: 5 })).toBe(true);
    expect(groundIsOpen(g, WATER, { x: 15, y: 8, z: 15 })).toBe(false);
  });
});

const SIZES: MapSize[] = ['small', 'large'];
const SEEDS = [1, 2, 3];

/** Standable regions at least this big (m^2) must always be reachable. */
const BIG = 30;

describe.each(TERRAIN_STYLES)('reachability of %s maps', (style) => {
  it('connects every sizeable standable region, deterministically', () => {
    const rows: string[] = [];
    for (const size of SIZES) {
      for (const seed of SEEDS) {
        const n = MAP_SIZE_CELLS[size];
        const cfg = { ...DEFAULT_TERRAIN_CONFIG, style, nx: n, nz: n };
        const { grid, descriptor } = generateTerrain(cfg, new Rng(seed));
        const map = analyzeReachability(grid, descriptor.waterLevel);
        const spawns = findSpawnPoints(grid, descriptor, 8, new Rng(seed + 1000), 4);
        expect(spawns, `${size} seed ${seed}`).toHaveLength(8);
        const starts = startComponents(map, spawns);
        expect(starts.size, 'spawns share one region').toBe(1);
        expect([...starts][0]).toBe(largestRegion(map));
        const r = reachableFraction(map, starts, BIG);
        rows.push(
          `${size} seed ${seed}: ${(r.fraction * 100).toFixed(1)}% of ${r.total.toFixed(0)} m2`,
        );
        expect(r.stranded, `${size} seed ${seed}`).toEqual([]);
        expect(r.fraction, `${size} seed ${seed}`).toBeGreaterThan(0.88);
      }
    }
    console.info(`${style} reachable standable area\n  ${rows.join('\n  ')}`);
  }, 120_000);

  it('builds identical grids for the same seed', () => {
    const cfg = { ...DEFAULT_TERRAIN_CONFIG, style, nx: 128, nz: 128 };
    const a = generateTerrain(cfg, new Rng(5)).grid;
    const b = generateTerrain(cfg, new Rng(5)).grid;
    expect(Buffer.from(a.data.buffer).equals(Buffer.from(b.data.buffer))).toBe(true);
  });
});
