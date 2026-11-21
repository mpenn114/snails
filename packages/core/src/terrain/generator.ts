import type { Rng } from '../rng.js';
import type { TerrainDescriptor, Vec3 } from '../state/types.js';
import { ValueNoise } from './noise.js';
import { SdfGrid } from './sdf-grid.js';

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
  caveDensity: 0.25,
  caveFrequency: 0.08,
  waterLevel: 4,
  islandFalloff: true,
};

const FLOOR_CELLS = 3;

function islandHeight(c: TerrainGenConfig, h: number, x: number, z: number): number {
  const cx = (c.nx - 1) / 2;
  const cz = (c.nz - 1) / 2;
  const d = Math.max(Math.abs(x - cx) / cx, Math.abs(z - cz) / cz);
  const t = Math.min(1, Math.max(0, (d - 0.55) / 0.45));
  const f = t * t * (3 - 2 * t);
  return h * (1 - f) + (c.waterLevel - 2) * f;
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
  const grid = new SdfGrid(nx, ny, nz, cs);
  const band = 4 * cs;
  const thr = 1 - config.caveDensity;
  const hf = cs * config.hillFrequency;
  const cf = cs * config.caveFrequency;
  for (let z = 0; z < nz; z++) {
    for (let x = 0; x < nx; x++) {
      let h =
        config.baseHeight + config.hillAmplitude * 1.6 * noise.fbm2(x * hf, z * hf, config.octaves);
      if (config.islandFalloff) h = islandHeight(config, h, x, z);
      for (let y = 0; y < ny; y++) {
        let v = y * cs - h;
        if (config.caveDensity > 0 && y >= FLOOR_CELLS) {
          const r = 1 - Math.abs(noise.fbm3(x * cf, y * cf, z * cf, 2));
          const margin = Math.min(1, (y - FLOOR_CELLS + 1) / 3);
          v = Math.max(v, -(r - thr) * 6 * margin);
        }
        grid.data[grid.index(x, y, z)] = Math.max(-band, Math.min(band, v));
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
