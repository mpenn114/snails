import { describe, expect, it } from 'vitest';
import { Rng } from '../rng.js';
import { DEFAULT_TERRAIN_CONFIG as C, findSpawnPoints, generateTerrain } from './generator.js';

const sum = (d: Float32Array): number => {
  let h = 2166136261;
  const u = new Uint32Array(d.buffer, d.byteOffset, d.length);
  for (const v of u) h = Math.imul(h ^ v, 16777619) >>> 0;
  return h;
};

describe('generateTerrain', () => {
  it('is deterministic and seed-sensitive, fast', () => {
    const t0 = Date.now();
    const a = generateTerrain(C, new Rng(1));
    expect(Date.now() - t0).toBeLessThan(1000);
    expect(sum(a.grid.data)).toBe(sum(generateTerrain(C, new Rng(1)).grid.data));
    expect(sum(a.grid.data)).not.toBe(sum(generateTerrain(C, new Rng(2)).grid.data));
    expect(a.descriptor.waterLevel).toBe(C.waterLevel);
    expect(a.grid.isDirty(0)).toBe(true);
  });

  it('has water-covered island edges and a solid floor', () => {
    const { grid } = generateTerrain(C, new Rng(3));
    const wy = Math.floor(C.waterLevel / C.cellSize) + 1;
    for (let i = 0; i < grid.nx; i++) {
      expect(grid.get(i, wy, 0)).toBeGreaterThan(0);
      expect(grid.get(0, wy, i)).toBeGreaterThan(0);
    }
    expect(grid.get(48, 2, 48)).toBeLessThan(0);
  });

  it('finds spaced spawn points on solid dry ground', () => {
    const { grid, descriptor } = generateTerrain(C, new Rng(4));
    const pts = findSpawnPoints(grid, descriptor, 4, new Rng(9), 8);
    expect(pts.length).toBeGreaterThan(0);
    expect(findSpawnPoints(grid, descriptor, 4, new Rng(9), 8)).toEqual(pts);
    for (const [i, p] of pts.entries()) {
      expect(p.y).toBeGreaterThan(descriptor.waterLevel);
      expect(grid.sampleLinear({ ...p, y: p.y - 0.2 })).toBeLessThan(0);
      expect(grid.sampleLinear({ ...p, y: p.y + 0.2 })).toBeGreaterThan(0);
      for (const q of pts.slice(i + 1)) {
        expect(Math.hypot(p.x - q.x, p.z - q.z)).toBeGreaterThanOrEqual(8);
      }
    }
  });
});
