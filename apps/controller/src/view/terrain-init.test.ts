import { describe, expect, it } from 'vitest';
import { buildTerrainInit } from './terrain-init';

const params = {
  nx: 24,
  ny: 16,
  nz: 24,
  cellSize: 0.5,
  baseHeight: 4,
  hillAmplitude: 2,
  hillFrequency: 0.04,
  octaves: 3,
  caveDensity: 0.2,
  caveFrequency: 0.08,
  waterLevel: 2,
  islandFalloff: true,
};

describe('buildTerrainInit', () => {
  it('is deterministic for a seed and differs across seeds', () => {
    const a = buildTerrainInit(42, params);
    const b = buildTerrainInit(42, params);
    const c = buildTerrainInit(43, params);
    expect(Array.from(a.grid.data)).toEqual(Array.from(b.grid.data));
    expect(Array.from(a.grid.data)).not.toEqual(Array.from(c.grid.data));
    expect(a.waterLevel).toBe(2);
    expect(a.grid.nx).toBe(24);
  });
});
