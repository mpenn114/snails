import { describe, expect, it } from 'vitest';
import { Rng } from '../rng.js';
import { DEFAULT_TERRAIN_CONFIG, findSpawnPoints, generateTerrain } from './generator.js';
import { TERRAIN_STYLES } from './styles/types.js';

/** Lobby maximum: 8 teams (palette size) x 8 snails per team. */
const MAX_SNAILS = 64;

describe.each(TERRAIN_STYLES)('spawn capacity on %s', (style) => {
  it('places the lobby maximum on 50 seeds, without overlap, deterministically', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const C = { ...DEFAULT_TERRAIN_CONFIG, style };
      const { grid, descriptor } = generateTerrain(C, new Rng(seed));
      const pts = findSpawnPoints(grid, descriptor, MAX_SNAILS, new Rng(seed + 1000), 4);
      expect(pts, `seed ${seed}`).toHaveLength(MAX_SNAILS);
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const a = pts[i]!;
          const b = pts[j]!;
          expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual(1.1 - 1e-9);
        }
      }
      if (seed === 1) {
        const again = findSpawnPoints(grid, descriptor, MAX_SNAILS, new Rng(seed + 1000), 4);
        expect(again).toEqual(pts);
      }
    }
  }, 120_000);
});
