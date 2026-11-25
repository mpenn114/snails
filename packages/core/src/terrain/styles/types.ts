import type { Rng } from '../../rng.js';
import type { ValueNoise } from '../noise.js';

/** Names of the procedural terrain styles (map archetypes). */
export const TERRAIN_STYLES = ['island', 'archipelago', 'highlands', 'caverns', 'canyon'] as const;

/** One procedural terrain style. */
export type TerrainStyle = (typeof TERRAIN_STYLES)[number];

/** The subset of the generator config a style reads (lengths in metres, grid sizes in cells). */
export interface StyleConfig {
  nx: number;
  ny: number;
  nz: number;
  cellSize: number;
  baseHeight: number;
  hillAmplitude: number;
  hillFrequency: number;
  octaves: number;
  caveDensity: number;
  caveFrequency: number;
  waterLevel: number;
  islandFalloff: boolean;
}

/**
 * The per-map shape of a style, built once by {@link TerrainStyleImpl.prepare}. All coordinates
 * are in cell units (x, y, z); heights and returned distances are in metres. Every function must
 * be a pure function of its inputs and the prepared data (no randomness), so server and clients
 * build identical grids.
 */
export interface StyleField {
  /** Height (m) of the column's main ground surface at cell (x, z). */
  surface(x: number, z: number): number;
  /**
   * Optional extra solid (sea stacks, arches, overhangs): a signed distance (m, negative =
   * solid) unioned with the surface, `v = min(v, add)`.
   */
  add?(x: number, y: number, z: number, h: number): number;
  /**
   * Optional void (caves, tunnels): a signed distance (m, positive = void) subtracted from the
   * solid, `v = max(v, carve)`. Applied after {@link add}.
   */
  carve?(x: number, y: number, z: number, h: number): number;
  /**
   * Optional material override for a solid cell; return `undefined` to use the default strata
   * (`materialForCell` with surface height `h`).
   */
  material?(x: number, y: number, z: number, h: number): number | undefined;
}

/** A terrain style: turns the config, seeded noise and rng into a {@link StyleField}. */
export interface TerrainStyleImpl {
  /** Builds the map's field. May consume `rng` (after the noise table has been built). */
  prepare(config: StyleConfig, noise: ValueNoise, rng: Rng): StyleField;
}
