import type { Rng } from '../rng.js';
import type { TerrainDescriptor, Vec3 } from '../state/types.js';
import { ValueNoise } from './noise.js';
import { SdfGrid } from './sdf-grid.js';
import { materialForCell } from './strata.js';

/** Parameters for the procedural terrain generator (lengths in metres). */
export interface TerrainGenConfig {
  nx: number;
  ny: number;
  nz: number;
  cellSize: number;
  /** Mean surface height (m). */
  baseHeight: number;
  /** Hill height variation (m, +/-). */
  hillAmplitude: number;
  /** Hill noise frequency (cycles per metre). */
  hillFrequency: number;
  octaves: number;
  /** 0 = no caves; ~0.1..0.5 typical. */
  caveDensity: number;
  /** Cave noise frequency (cycles per metre). */
  caveFrequency: number;
  /** World Y of the water surface (m). */
  waterLevel: number;
  /** Push terrain below water towards the map edges. */
  islandFalloff: boolean;
}

/** Default config: a 48 m x 24 m x 48 m arena at 0.5 m cells. */
export const DEFAULT_TERRAIN_CONFIG: TerrainGenConfig = {
  nx: 96,
  ny: 48,
  nz: 96,
  cellSize: 0.5,
  baseHeight: 9,
  hillAmplitude: 5,
  hillFrequency: 0.04,
  octaves: 4,
  caveDensity: 0.18,
  caveFrequency: 0.08,
  waterLevel: 4,
  islandFalloff: true,
};

/** Metres of solid rock kept above any cave ceiling. */
const CAVE_ROOF = 3.5;
/** Metres the sea floor lies below the water surface. */
const SEA_DEPTH = 2.5;

interface Lobe {
  x: number;
  z: number;
  r: number;
}

/** One big central island plus a few overlapping lobes, in cell units. */
function makeLobes(c: TerrainGenConfig, rng: Rng): Lobe[] {
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
  return lobes;
}

const smooth = (a: number, b: number, v: number): number => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Surface height (m) at cell (x, z); land profile with plateau tiers, cliffs and shore. */
function surfaceHeight(
  c: TerrainGenConfig,
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

/** Cave carve value (positive = void): roofed, away from the shore, never near the sea floor. */
function caveCarve(
  c: TerrainGenConfig,
  noise: ValueNoise,
  x: number,
  y: number,
  z: number,
  h: number,
): number {
  const cf = c.cellSize * c.caveFrequency;
  const yy = y * c.cellSize;
  const r = 1 - Math.abs(noise.fbm3(x * cf, yy * cf * 2, z * cf, 2));
  const roof = h - CAVE_ROOF - yy;
  const floor = (yy - (c.waterLevel - SEA_DEPTH + 1.5)) * 2;
  return Math.min(-(r - (1 - c.caveDensity)) * 6, roof, floor);
}

/**
 * Generates terrain. All chunks are left dirty so the renderer meshes everything initially;
 * callers should `takeDirtyChunks()` once consumed.
 */
export function generateTerrain(
  config: TerrainGenConfig,
  rng: Rng,
): { grid: SdfGrid; descriptor: TerrainDescriptor } {
  const { nx, ny, nz, cellSize: cs } = config;
  const noise = new ValueNoise(rng);
  const lobes = makeLobes(config, rng);
  const grid = new SdfGrid(nx, ny, nz, cs);
  const band = 4 * cs;
  const strata = { cellSize: cs, waterLevel: config.waterLevel };
  for (let z = 0; z < nz; z++) {
    for (let x = 0; x < nx; x++) {
      const h = surfaceHeight(config, noise, lobes, x, z);
      for (let y = 0; y < ny; y++) {
        let v = y * cs - h;
        if (config.caveDensity > 0 && h > config.waterLevel + CAVE_ROOF) {
          v = Math.max(v, caveCarve(config, noise, x, y, z, h));
        }
        const i = grid.index(x, y, z);
        grid.data[i] = Math.max(-band, Math.min(band, v));
        // Material is laid out from the pre-cave surface height so strata ignore caves.
        grid.materials[i] = materialForCell(noise, strata, x, y, z, h);
      }
    }
  }
  for (const id of grid.chunkIds()) grid.markDirty(id);
  const descriptor: TerrainDescriptor = { nx, ny, nz, cellSize: cs, waterLevel: config.waterLevel };
  return { grid, descriptor };
}

function surfaceAt(grid: SdfGrid, x: number, z: number): number | null {
  for (let y = grid.ny - 2; y >= 0; y--) {
    const a = grid.get(x, y, z);
    if (a < 0) {
      const b = grid.get(x, y + 1, z);
      if (b <= 0) return null;
      return (y + a / (a - b)) * grid.cellSize;
    }
  }
  return null;
}

/**
 * Picks up to `count` deterministic spawn points on gentle, dry, solid surface, at least
 * `minSpacing` metres apart (horizontally). May return fewer.
 */
export function findSpawnPoints(
  grid: SdfGrid,
  descriptor: TerrainDescriptor,
  count: number,
  rng: Rng,
  minSpacing: number,
): Vec3[] {
  const out: Vec3[] = [];
  const margin = 2;
  for (let i = 0; i < count * 300 && out.length < count; i++) {
    const x = rng.int(margin, grid.nx - 1 - margin);
    const z = rng.int(margin, grid.nz - 1 - margin);
    const y = surfaceAt(grid, x, z);
    if (y === null || y < descriptor.waterLevel + 0.5) continue;
    const p = { x: x * grid.cellSize, y, z: z * grid.cellSize };
    if (grid.normal(p).y < 0.85) continue;
    if (out.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < minSpacing)) continue;
    out.push(p);
  }
  return out;
}
