import type { ValueNoise } from './noise.js';
import { MATERIAL_CLAY, MATERIAL_ROCK, MATERIAL_SAND, MATERIAL_SOIL } from './materials.js';

/** Inputs for {@link materialForCell}. */
export interface StrataParams {
  /** Cell edge length (m). */
  cellSize: number;
  /** World Y of the water surface (m). */
  waterLevel: number;
}

/** Metres of topsoil (or beach sand) at the surface. */
const TOPSOIL = 1.2;
/** Depth below the surface at which solid rock begins (m). */
const BEDROCK_DEPTH = 5.5;
/** Vertical period of clay layers (m) and their thickness (m). */
const CLAY_PERIOD = 4;
const CLAY_THICKNESS = 1.3;

/**
 * Deterministic material of one solid cell: sand on beaches, soil on top, wobbly clay layers
 * below, rock boulders and bedrock at depth. Pure function of the noise field (already seeded
 * from the map seed), the cell and the column's surface height `h` (m); consumes no randomness.
 */
export function materialForCell(
  noise: ValueNoise,
  p: StrataParams,
  x: number,
  y: number,
  z: number,
  h: number,
): number {
  const cs = p.cellSize;
  const yy = y * cs;
  const depth = h - yy;
  const wx = x * cs;
  const wz = z * cs;
  if (h < p.waterLevel + 1.2 && depth < 3.5) return MATERIAL_SAND;
  if (depth < TOPSOIL) return MATERIAL_SOIL;
  const wobble = noise.fbm2(wx * 0.07 + 31, wz * 0.07 - 17, 2) * 4;
  const boulder = noise.fbm3(wx * 0.16 + 5, yy * 0.2, wz * 0.16 - 9, 2);
  if (depth > BEDROCK_DEPTH + wobble * 0.5 || (depth > 2 && boulder > 0.62)) return MATERIAL_ROCK;
  const band = (((yy + wobble) % CLAY_PERIOD) + CLAY_PERIOD) % CLAY_PERIOD;
  return band < CLAY_THICKNESS ? MATERIAL_CLAY : MATERIAL_SOIL;
}
