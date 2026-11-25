import { describe, expect, it } from 'vitest';
import { Rng } from '../../rng.js';
import { DEFAULT_TERRAIN_CONFIG, generateTerrain } from '../generator.js';
import type { SdfGrid } from '../sdf-grid.js';

const C = { ...DEFAULT_TERRAIN_CONFIG, style: 'caverns' as const };
const CS = C.cellSize;

/** Index of the highest solid cell of a column, or -1. */
function topSolid(g: SdfGrid, x: number, z: number): number {
  for (let y = g.ny - 1; y >= 0; y--) if (g.get(x, y, z) < 0) return y;
  return -1;
}

/** Void cells with solid rock somewhere above them in the column, above the sea. */
function roofedVoid(g: SdfGrid): number {
  let n = 0;
  for (let z = 0; z < g.nz; z++) {
    for (let x = 0; x < g.nx; x++) {
      const top = topSolid(g, x, z);
      for (let y = Math.ceil((C.waterLevel + 1) / CS); y < top; y++) if (g.get(x, y, z) > 0) n++;
    }
  }
  return n;
}

/** Air cells within the band y <= `maxY` (m) reachable from the map corner, as a flag array. */
function reachableAir(g: SdfGrid, maxY: number): Uint8Array {
  const seen = new Uint8Array(g.nx * g.ny * g.nz);
  const y0 = Math.ceil((C.waterLevel + 0.5) / CS);
  const y1 = Math.floor(maxY / CS);
  const stack = [g.index(1, y0, 1)];
  seen[stack[0] as number] = 1;
  while (stack.length > 0) {
    const i = stack.pop() as number;
    const x = i % g.nx;
    const y = Math.floor(i / g.nx) % g.ny;
    const z = Math.floor(i / (g.nx * g.ny));
    for (const [dx, dy, dz] of [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [0, 0, 1],
      [0, 0, -1],
    ] as const) {
      const [a, b, c] = [x + dx, y + dy, z + dz];
      if (a < 0 || c < 0 || a >= g.nx || c >= g.nz || b < y0 || b > y1) continue;
      const j = g.index(a, b, c);
      if (seen[j] || g.get(a, b, c) <= 0) continue;
      seen[j] = 1;
      stack.push(j);
    }
  }
  return seen;
}

describe('caverns style', () => {
  it.each([1, 3, 7])('seed %i: the mesa is hollow with chambers and tunnels', (seed) => {
    const { grid } = generateTerrain(C, new Rng(seed));
    expect(roofedVoid(grid) * CS ** 3).toBeGreaterThan(150);
  });

  it.each([1, 3, 7])('seed %i: roofs stay thick enough to walk on', (seed) => {
    const { grid } = generateTerrain(C, new Rng(seed));
    const minY = Math.ceil((C.waterLevel + 2) / CS);
    let thin = 0;
    for (let z = 0; z < grid.nz; z++) {
      for (let x = 0; x < grid.nx; x++) {
        const top = topSolid(grid, x, z);
        let y = top;
        while (y >= 0 && grid.get(x, y, z) < 0) y--;
        // Solid run from the top down to the first void below it, if that void is a cave.
        if (y >= minY && top * CS > C.waterLevel + 8 && (top - y) * CS < 2.4) thin++;
      }
    }
    // A few columns on the sloping cliff lip beside a mouth may be thin; the interior is not.
    expect(thin).toBeLessThan(40);
  });

  it.each([1, 3, 7])('seed %i: at least 2 entrances open to the outside air', (seed) => {
    const { grid } = generateTerrain(C, new Rng(seed));
    const seen = reachableAir(grid, C.waterLevel + 5.5);
    const sectors = new Set<number>();
    const cx = (grid.nx - 1) / 2;
    const cz = (grid.nz - 1) / 2;
    for (let i = 0; i < seen.length; i++) {
      if (!seen[i]) continue;
      const x = i % grid.nx;
      const z = Math.floor(i / (grid.nx * grid.ny));
      const r = Math.hypot(x - cx, z - cz) * CS;
      // Reached air well inside the cliff line can only have come in through a mouth.
      if (r < 11) sectors.add(Math.floor(((Math.atan2(z - cz, x - cx) + Math.PI) / Math.PI) * 3));
    }
    expect(sectors.size).toBeGreaterThanOrEqual(2);
  });

  it.each([1, 3, 7])('seed %i: has a skylight shaft down into a chamber', (seed) => {
    const { grid } = generateTerrain(C, new Rng(seed));
    const hi = Math.round(13 / CS);
    let shafts = 0;
    for (let z = 8; z < grid.nz - 8; z++) {
      for (let x = 8; x < grid.nx - 8; x++) {
        const top = topSolid(grid, x, z);
        // A column open to the sky down to a floor, with mesa rock on both sides at height.
        if (top * CS < C.waterLevel + 4 && top * CS > C.waterLevel + 1) {
          if (grid.get(x - 4, hi, z) < 0 && grid.get(x + 4, hi, z) < 0) shafts++;
        }
      }
    }
    expect(shafts).toBeGreaterThan(5);
  });
});
