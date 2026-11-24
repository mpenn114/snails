import { describe, expect, it } from 'vitest';
import {
  colorDistance,
  LIGHTING,
  PALETTE,
  simulateCvd,
  TEAM_COLORS,
  TERRAIN_COLOR_NAMES,
} from './palette.js';

const MIN_TEAM_DELTA = 20;
const MIN_TEAM_DELTA_CVD = 10;
const MIN_TERRAIN_DELTA = 25;

describe('palette', () => {
  it('has 8 team colours', () => {
    expect(TEAM_COLORS).toHaveLength(8);
  });

  it('keeps team colours pairwise distinct', () => {
    for (let i = 0; i < 8; i++)
      for (let j = i + 1; j < 8; j++)
        expect(colorDistance(TEAM_COLORS[i]!, TEAM_COLORS[j]!), `${i} vs ${j}`).toBeGreaterThan(
          MIN_TEAM_DELTA,
        );
  });

  it('keeps team colours distinct under protanopia and deuteranopia', () => {
    for (const kind of ['protan', 'deutan'] as const)
      for (let i = 0; i < 8; i++)
        for (let j = i + 1; j < 8; j++)
          expect(
            colorDistance(simulateCvd(TEAM_COLORS[i]!, kind), simulateCvd(TEAM_COLORS[j]!, kind)),
            `${kind} ${i} vs ${j}`,
          ).toBeGreaterThan(MIN_TEAM_DELTA_CVD);
  });

  it('keeps team colours away from terrain colours', () => {
    for (const t of TEAM_COLORS)
      for (const n of TERRAIN_COLOR_NAMES)
        expect(colorDistance(t, PALETTE[n]), `${t.toString(16)} vs ${n}`).toBeGreaterThan(
          MIN_TERRAIN_DELTA,
        );
  });

  it('has sane lighting', () => {
    expect(LIGHTING.fogStartFraction).toBeLessThan(LIGHTING.fogEndFraction);
    expect(LIGHTING.sunElevationDeg).toBeGreaterThan(0);
  });
});
