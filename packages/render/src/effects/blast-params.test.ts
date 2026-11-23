import { describe, expect, it } from 'vitest';
import { PALETTE, colorDistance } from '../style/palette.js';
import {
  DEBRIS_COLOURS,
  blastCounts,
  debrisScale,
  flashOpacity,
  pickDebrisColour,
  puffScale,
  ringOpacity,
  ringScale,
  smokeColour,
  smokeScale,
} from './blast-params.js';
import { TRAIL_COLOUR } from './pebble-geometry.js';

describe('blastCounts', () => {
  it('grows with radius and stays inside art-direction ranges at radius 4', () => {
    const c = blastCounts(4, 1);
    expect(c.smoke).toBeGreaterThanOrEqual(5);
    expect(c.smoke).toBeLessThanOrEqual(12);
    expect(c.debris).toBeGreaterThanOrEqual(6);
    const small = blastCounts(1, 1);
    expect(small.smoke).toBeLessThan(c.smoke);
    expect(small.debris).toBeLessThan(c.debris);
    expect(small.sparks).toBeLessThan(c.sparks);
  });
  it('scales down with quality and is empty at zero', () => {
    const hi = blastCounts(4, 1);
    const mob = blastCounts(4, 0.25);
    expect(mob.smoke).toBeLessThan(hi.smoke);
    expect(mob.debris).toBeLessThan(hi.debris);
    expect(blastCounts(4, 0)).toEqual({ smoke: 0, debris: 0, sparks: 0 });
  });
});

describe('curves', () => {
  it('smoke grows then shrinks to nothing', () => {
    expect(smokeScale(0)).toBeCloseTo(0.3);
    expect(smokeScale(0.5)).toBeGreaterThan(smokeScale(0.1));
    expect(smokeScale(1)).toBeCloseTo(0);
  });
  it('debris holds size then shrinks; puff and ring end at zero', () => {
    expect(debrisScale(0.5)).toBe(1);
    expect(debrisScale(1)).toBeCloseTo(0);
    expect(puffScale(1)).toBeCloseTo(0);
    expect(puffScale(0.1)).toBeGreaterThan(0.5);
    expect(ringOpacity(1)).toBeCloseTo(0);
    expect(ringScale(1)).toBeCloseTo(1);
    expect(flashOpacity(0)).toBeLessThanOrEqual(0.7);
    expect(flashOpacity(1)).toBe(0);
  });
  it('smoke colour starts warm white and ends darker grey', () => {
    const a = [0, 0, 0];
    const b = [0, 0, 0];
    smokeColour(0, a);
    smokeColour(1, b);
    expect(a[0]).toBeGreaterThan(0.9);
    expect((b[0] ?? 1) + (b[1] ?? 1) + (b[2] ?? 1)).toBeLessThan((a[0] ?? 0) * 3 * 0.7);
  });
});

describe('debris colours', () => {
  it('come only from the terrain palette and cover each entry', () => {
    const allowed: number[] = [PALETTE.soil, PALETTE.grassTop, PALETTE.deepSoil, PALETTE.rock];
    const seen = new Set<number>();
    for (let i = 0; i < 100; i++) seen.add(pickDebrisColour(i / 100));
    for (const c of seen) expect(allowed).toContain(c);
    expect(seen.size).toBe(DEBRIS_COLOURS.length);
  });
});

describe('trail colour contrast', () => {
  it('differs from grass, sky, soil and water by delta E over 25', () => {
    for (const bg of [PALETTE.grassTop, PALETTE.skyTop, PALETTE.soil, PALETTE.waterShallow]) {
      expect(colorDistance(TRAIL_COLOUR, bg)).toBeGreaterThan(25);
    }
  });
});
