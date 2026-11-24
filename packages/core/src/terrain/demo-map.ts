import type { Rng } from '../rng.js';
import type { TerrainDescriptor } from '../state/types.js';
import { generateTerrain, type TerrainGenConfig } from './generator.js';
import { MATERIAL_CLAY, MATERIAL_ROCK, MATERIAL_SAND, MATERIAL_SOIL } from './materials.js';
import { SdfGrid } from './sdf-grid.js';

/** Metres the sea floor lies below the water surface in the demo map. */
const SEA_DEPTH = 2.5;
/** Metres from the z edges over which the land slopes down into the sea. */
const EDGE_FALLOFF = 4;

/** A demo-map surface profile point: x as a fraction of the map length, height above the base. */
type Knot = readonly [u: number, rise: number];

/**
 * Surface profile along x as `[fraction of map length, metres above the water surface]`,
 * linearly interpolated. From the west edge: beach and sea (bash knockback), start plateau, a
 * step up to a ledge (rope), a long slope back down (roller), a narrow pit (dew bomb
 * drowning), a landing terrace and a tall banded block (drill).
 */
const PROFILE: readonly Knot[] = [
  [0, -SEA_DEPTH],
  [0.04, -SEA_DEPTH],
  [0.1, 4],
  [0.3, 4],
  [0.33, 10],
  [0.46, 10],
  [0.66, 5],
  [0.7, 5],
  [0.705, 1],
  [0.78, 1],
  [0.785, 5],
  [0.84, 5],
  [0.86, 11],
  [1, 11],
];

function profileRise(u: number): number {
  for (let i = 1; i < PROFILE.length; i++) {
    const [u1, h1] = PROFILE[i] as Knot;
    if (u <= u1) {
      const [u0, h0] = PROFILE[i - 1] as Knot;
      return u1 === u0 ? h1 : h0 + ((u - u0) / (u1 - u0)) * (h1 - h0);
    }
  }
  return (PROFILE[PROFILE.length - 1] as Knot)[1];
}

/** Material of a solid cell: sand on the beach, soil crust, then clay and rock bands in the block. */
function demoMaterial(xFrac: number, depth: number, y: number, c: TerrainGenConfig): number {
  if (xFrac < 0.12 && y < c.waterLevel + 3) return MATERIAL_SAND;
  if (depth < 1) return MATERIAL_SOIL;
  if (xFrac > 0.86) {
    const band = (y - c.waterLevel) % 4;
    if (band >= 0 && band < 1.5) return MATERIAL_ROCK;
    if (band >= 2 && band < 3.5) return MATERIAL_CLAY;
  }
  return depth > 5 ? MATERIAL_ROCK : MATERIAL_SOIL;
}

/**
 * The deterministic "Weapons demo" arena: a 2.5D course (uniform along z, sloping into the sea at
 * the z edges) that exercises every base weapon. Uses no randomness and ignores the noise and
 * cave settings of `config`; sizes, cell size and water level are honoured.
 */
export function generateDemoTerrain(config: TerrainGenConfig): {
  grid: SdfGrid;
  descriptor: TerrainDescriptor;
} {
  const { nx, ny, nz, cellSize: cs } = config;
  const grid = new SdfGrid(nx, ny, nz, cs);
  const band = 4 * cs;
  for (let z = 0; z < nz; z++) {
    const edge = Math.min(z, nz - 1 - z) * cs;
    const k = Math.min(1, edge / EDGE_FALLOFF);
    for (let x = 0; x < nx; x++) {
      const xFrac = x / (nx - 1);
      const land = config.waterLevel + profileRise(xFrac);
      const sea = config.waterLevel - SEA_DEPTH;
      const h = sea + (land - sea) * k;
      for (let y = 0; y < ny; y++) {
        const i = grid.index(x, y, z);
        grid.data[i] = Math.max(-band, Math.min(band, y * cs - h));
        grid.materials[i] = demoMaterial(xFrac, h - y * cs, y * cs, config);
      }
    }
  }
  for (const id of grid.chunkIds()) grid.markDirty(id);
  const descriptor: TerrainDescriptor = { nx, ny, nz, cellSize: cs, waterLevel: config.waterLevel };
  return { grid, descriptor };
}

/**
 * Terrain for a match: the procedural island from the seeded `rng`, or the fixed demo arena when
 * `demo` is set. Server and clients both call this so they build identical grids.
 */
export function generateMatchTerrain(
  config: TerrainGenConfig,
  rng: Rng,
  demo = false,
): { grid: SdfGrid; descriptor: TerrainDescriptor } {
  return demo ? generateDemoTerrain(config) : generateTerrain(config, rng);
}
