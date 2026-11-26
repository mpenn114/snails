import type { Rng } from '../rng.js';
import type { TerrainDescriptor, Vec3 } from '../state/types.js';
import { ValueNoise } from './noise.js';
import { SdfGrid } from './sdf-grid.js';
import { materialForCell } from './strata.js';
import { TERRAIN_STYLE_IMPLS, type TerrainStyle } from './styles/index.js';

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
  /** Map archetype; omitted means `island`. */
  style?: TerrainStyle;
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
  const field = TERRAIN_STYLE_IMPLS[config.style ?? 'island'].prepare(config, noise, rng);
  const grid = new SdfGrid(nx, ny, nz, cs);
  const band = 4 * cs;
  const strata = { cellSize: cs, waterLevel: config.waterLevel };
  for (let z = 0; z < nz; z++) {
    for (let x = 0; x < nx; x++) {
      const h = field.surface(x, z);
      for (let y = 0; y < ny; y++) {
        let v = y * cs - h;
        if (field.add) v = Math.min(v, field.add(x, y, z, h));
        if (field.carve) v = Math.max(v, field.carve(x, y, z, h));
        const i = grid.index(x, y, z);
        grid.data[i] = Math.max(-band, Math.min(band, v));
        // Material is laid out from the pre-cave surface height so strata ignore caves.
        grid.materials[i] =
          field.material?.(x, y, z, h) ?? materialForCell(noise, strata, x, y, z, h);
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

/** Smallest spacing of the fallback pass: two snails (radius 0.5) never overlap. */
const MIN_FALLBACK_SPACING = 1.1;

/** Steepest surface (normal.y) the strict pass accepts, and the fallback pass for crowded lobbies. */
const STRICT_FLATNESS = 0.85;
const FALLBACK_FLATNESS = 0.6;

/** A dry, gentle, open-sky surface point at cell column (x, z), or null. */
function spawnCandidate(
  grid: SdfGrid,
  descriptor: TerrainDescriptor,
  x: number,
  z: number,
  flatness = STRICT_FLATNESS,
): Vec3 | null {
  const y = surfaceAt(grid, x, z);
  if (y === null || y < descriptor.waterLevel + 0.5) return null;
  const p = { x: x * grid.cellSize, y, z: z * grid.cellSize };
  return grid.normal(p).y < flatness ? null : p;
}

const farEnough = (out: readonly Vec3[], p: Vec3, spacing: number): boolean =>
  !out.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < spacing);

/**
 * Fallback for crowded lobbies (up to 8 teams x 8 snails on a small map): scans every valid
 * surface cell in a seeded shuffled order and tops `out` up at shrinking spacings, so spread
 * stays as wide as the terrain allows. Only runs when the normal pass came up short.
 */
function topUpSpawnPoints(
  grid: SdfGrid,
  descriptor: TerrainDescriptor,
  count: number,
  rng: Rng,
  minSpacing: number,
  out: Vec3[],
): void {
  const candidates: Vec3[] = [];
  const margin = 2;
  for (let z = margin; z <= grid.nz - 1 - margin; z++) {
    for (let x = margin; x <= grid.nx - 1 - margin; x++) {
      const p = spawnCandidate(grid, descriptor, x, z, FALLBACK_FLATNESS);
      if (p) candidates.push(p);
    }
  }
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [candidates[i], candidates[j]] = [candidates[j] as Vec3, candidates[i] as Vec3];
  }
  for (let s = minSpacing * 0.75; out.length < count; s = Math.max(MIN_FALLBACK_SPACING, s * 0.8)) {
    for (const p of candidates) {
      if (out.length >= count) return;
      if (farEnough(out, p, s)) out.push(p);
    }
    if (s <= MIN_FALLBACK_SPACING) return;
  }
}

/**
 * Picks up to `count` deterministic spawn points on gentle, dry, solid surface (the topmost
 * surface of a column, so the sky above is open), at least `minSpacing` metres apart
 * (horizontally). If the normal random pass cannot place everyone, a fallback pass tightens the
 * spacing down to {@link MIN_FALLBACK_SPACING}. May still return fewer.
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
    const p = spawnCandidate(grid, descriptor, x, z);
    if (p && farEnough(out, p, minSpacing)) out.push(p);
  }
  if (out.length < count) topUpSpawnPoints(grid, descriptor, count, rng, minSpacing, out);
  return out;
}
