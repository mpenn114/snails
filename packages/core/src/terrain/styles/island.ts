import type { Rng } from '../../rng.js';
import type { ValueNoise } from '../noise.js';
import { extraFeatures, smoothstep as smooth } from './shared.js';
import type { StyleConfig, StyleField, TerrainStyleImpl } from './types.js';

/** Metres of solid rock kept above any cave ceiling. */
export const CAVE_ROOF = 3.5;
/** Metres the sea floor lies below the water surface. */
export const SEA_DEPTH = 2.5;

interface Lobe {
  x: number;
  z: number;
  r: number;
}

/** One big central island plus a few overlapping lobes, in cell units. */
function makeLobes(c: StyleConfig, rng: Rng): Lobe[] {
  const half = Math.min(c.nx, c.nz) / 2;
  const lobes: Lobe[] = [{ x: (c.nx - 1) / 2, z: (c.nz - 1) / 2, r: half * 0.6 }];
  const n = 2 + rng.int(0, 1);
  const a0 = rng.range(0, Math.PI * 2);
  for (let i = 0; i < n; i++) {
    const a = a0 + (i * Math.PI * 2) / n + rng.range(-0.4, 0.4);
    const dist = half * rng.range(0.42, 0.52);
    lobes.push({
      x: (c.nx - 1) / 2 + Math.cos(a) * dist,
      z: (c.nz - 1) / 2 + Math.sin(a) * dist,
      r: half * rng.range(0.28, 0.36),
    });
  }
  // Bigger maps get satellite islets around the main landmass.
  const extra = extraFeatures(c.nx, c.nz, 4);
  for (let i = 0; i < extra; i++) {
    const a = rng.range(0, Math.PI * 2);
    const dist = half * rng.range(0.62, 0.8);
    lobes.push({
      x: (c.nx - 1) / 2 + Math.cos(a) * dist,
      z: (c.nz - 1) / 2 + Math.sin(a) * dist,
      r: half * rng.range(0.1, 0.17),
    });
  }
  return lobes;
}

/** Surface height (m) at cell (x, z); land profile with plateau tiers, cliffs and shore. */
function surfaceHeight(
  c: StyleConfig,
  noise: ValueNoise,
  lobes: Lobe[],
  x: number,
  z: number,
): number {
  const hf = c.cellSize * c.hillFrequency;
  const warp = 0.18 * noise.fbm2(x * hf * 0.9 + 40, z * hf * 0.9 - 7, 2);
  let f = -1;
  for (const l of lobes) f = Math.max(f, 1 - Math.hypot(x - l.x, z - l.z) / l.r + warp);
  const sea = c.waterLevel - SEA_DEPTH;
  if (!c.islandFalloff) f = 1;
  const land = smooth(0.02, 0.2, f);
  const tier = smooth(0.12, 0.22, noise.fbm2(x * hf * 0.7 + 9, z * hf * 0.7 + 3, 2));
  const hills = noise.fbm2(x * hf * 1.3, z * hf * 1.3, c.octaves);
  const top =
    c.waterLevel +
    3 +
    Math.max(0, c.baseHeight - c.waterLevel - 3 + c.hillAmplitude * (0.45 * tier + 1.9 * hills));
  return sea + land * (top - sea);
}

/**
 * Cave carve value (positive = void): roofed, away from the shore, never near the sea floor.
 * Exported so other styles can reuse the island's noise caves.
 */
export function caveCarve(
  c: StyleConfig,
  noise: ValueNoise,
  x: number,
  y: number,
  z: number,
  h: number,
): number {
  if (c.caveDensity <= 0 || h <= c.waterLevel + CAVE_ROOF) return -Infinity;
  const cf = c.cellSize * c.caveFrequency;
  const yy = y * c.cellSize;
  const r = 1 - Math.abs(noise.fbm3(x * cf, yy * cf * 2, z * cf, 2));
  const roof = h - CAVE_ROOF - yy;
  const floor = (yy - (c.waterLevel - SEA_DEPTH + 1.5)) * 2;
  return Math.min(-(r - (1 - c.caveDensity)) * 6, roof, floor);
}

/** The original style: one chunky island of plateau tiers, cliffs and shore, with noise caves. */
export const islandStyle: TerrainStyleImpl = {
  prepare(c, noise, rng): StyleField {
    const lobes = makeLobes(c, rng);
    return {
      surface: (x, z) => surfaceHeight(c, noise, lobes, x, z),
      carve: (x, y, z, h) => caveCarve(c, noise, x, y, z, h),
    };
  },
};
