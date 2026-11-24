import { describe, expect, it } from 'vitest';
import { Rng } from '../rng.js';
import { carveSphere, carvedCellValue } from './carve.js';
import { DEFAULT_TERRAIN_CONFIG as C, generateTerrain } from './generator.js';
import {
  BASE_TERRAIN_MATERIALS,
  MATERIAL_CLAY,
  MATERIAL_ROCK,
  MATERIAL_SAND,
  MATERIAL_SOIL,
  defineTerrainMaterial,
} from './materials.js';
import { SdfGrid } from './sdf-grid.js';

/** Solid grid with the given material in every cell. */
function solid(material: number): SdfGrid {
  const g = new SdfGrid(40, 40, 40, 1, -5);
  g.materials.fill(material);
  return g;
}

/** Number of air cells after carving radius 6 at the centre with the given power. */
function carved(material: number, power?: number): number {
  const g = solid(material);
  carveSphere(g, { x: 20, y: 20, z: 20 }, 6, power);
  return g.data.reduce((n, v) => n + (v >= 0 ? 1 : 0), 0);
}

describe('terrain materials', () => {
  it('validates definitions', () => {
    expect(BASE_TERRAIN_MATERIALS.map((m) => m.id)).toEqual(['soil', 'sand', 'clay', 'rock']);
    expect(() =>
      defineTerrainMaterial({ id: 'x', name: 'X', carveResistance: -0.9, colour: 1 }),
    ).toThrow(/Invalid terrain material x/);
  });

  it('scales carve volume by (1 - resistance)', () => {
    const soil = carved(MATERIAL_SOIL);
    expect(carved(MATERIAL_SAND)).toBeGreaterThan(soil);
    expect(carved(MATERIAL_CLAY)).toBeLessThan(soil * 0.2);
    const g = solid(MATERIAL_CLAY);
    carveSphere(g, { x: 20, y: 20, z: 20 }, 6);
    expect(g.get(24, 20, 20)).toBeLessThan(0); // 4 m away, beyond clay's 3 m radius
    expect(g.get(22, 20, 20)).toBeGreaterThanOrEqual(0);
  });

  it('rock resists weak carves entirely and strong ones partially', () => {
    expect(carved(MATERIAL_ROCK, 10)).toBe(0);
    const strong = carved(MATERIAL_ROCK, 50);
    expect(strong).toBeGreaterThan(0);
    expect(strong).toBeLessThan(carved(MATERIAL_CLAY));
  });

  it('stops a crater at a rock layer cell by cell', () => {
    const g = new SdfGrid(40, 40, 40, 1, -5);
    for (let z = 0; z < 40; z++)
      for (let y = 0; y < 20; y++)
        for (let x = 0; x < 40; x++) g.materials[g.index(x, y, z)] = MATERIAL_ROCK;
    carveSphere(g, { x: 20, y: 24, z: 20 }, 8, 10);
    expect(g.get(20, 24, 20)).toBeGreaterThanOrEqual(0);
    expect(g.get(20, 19, 20)).toBeLessThan(0);
    expect(g.get(20, 10, 20)).toBeLessThan(0);
  });

  it('carvedCellValue matches carveSphere writes', () => {
    const g = solid(MATERIAL_CLAY);
    const expected = carvedCellValue(g, 22, 20, 20, { x: 20, y: 20, z: 20 }, 6);
    carveSphere(g, { x: 20, y: 20, z: 20 }, 6);
    expect(g.get(22, 20, 20)).toBe(expected);
  });
});

describe('material placement', () => {
  const hash = (m: Uint8Array): number => m.reduce((h, v) => Math.imul(h ^ v, 16777619) >>> 0, 7);

  it('is deterministic per seed and varies between seeds', () => {
    const a = generateTerrain(C, new Rng(5)).grid.materials;
    expect(hash(generateTerrain(C, new Rng(5)).grid.materials)).toBe(hash(a));
    expect(hash(generateTerrain(C, new Rng(6)).grid.materials)).not.toBe(hash(a));
  });

  it('lays out strata with every material present in meaningful amounts', () => {
    const { grid } = generateTerrain(C, new Rng(5));
    const counts = [0, 0, 0, 0];
    for (let i = 0; i < grid.data.length; i++) {
      if ((grid.data[i] as number) < 0) counts[grid.materials[i] as number]!++;
    }
    for (const n of counts) expect(n).toBeGreaterThan(500);
  });
});
