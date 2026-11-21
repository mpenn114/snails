import type { Snail } from '../state/types.js';
import { SNAIL_RADIUS } from '../physics/projectile-system.js';
import type { CellRegion, FloatingCluster } from './collapse.js';
import type { SdfGrid } from './sdf-grid.js';

/** Maximum cells a snail is lifted when pushed out of landed terrain. */
const MAX_PUSH_CELLS = 64;

/** Living snails in input order. */
export function livingSnailsOf(snails: readonly Snail[]): Snail[] {
  return snails.filter((s) => s.alive);
}

/**
 * Sets grounded snails resting on top of a cluster airborne (`grounded = false`,
 * `airborneFromY` = current y) so the normal movement and hazard systems fall and land them.
 * "Resting" means: over a cluster column, with y between the column's top surface and one
 * snail diameter plus one cell above it. Snails are never teleported.
 */
export function releaseSnails(
  grid: SdfGrid,
  cluster: FloatingCluster,
  snails: readonly Snail[],
): void {
  const cs = grid.cellSize;
  const tops = new Map<number, number>();
  for (const i of cluster.cells) {
    const x = i % grid.nx;
    const y = Math.floor(i / grid.nx) % grid.ny;
    const z = Math.floor(i / (grid.nx * grid.ny));
    const key = x + grid.nx * z;
    tops.set(key, Math.max(tops.get(key) ?? -1, y));
  }
  for (const s of snails) {
    if (s.grounded === false) continue;
    const top = tops.get(Math.round(s.position.x / cs) + grid.nx * Math.round(s.position.z / cs));
    if (top === undefined) continue;
    const rel = s.position.y - top * cs;
    if (rel >= 0 && rel <= 2 * SNAIL_RADIUS + cs) {
      s.grounded = false;
      s.airborneFromY = s.position.y;
    }
  }
}

/**
 * Lifts snails whose centre is inside the landed cluster's (padded) bounds and overlapping
 * terrain (SDF at the centre < snail radius) straight up, one cell at a time, until clear.
 * The lift is capped at {@link MAX_PUSH_CELLS} cells. Velocity and grounded state are kept.
 */
export function pushSnailsOut(grid: SdfGrid, bounds: CellRegion, snails: readonly Snail[]): void {
  const cs = grid.cellSize;
  const pad = SNAIL_RADIUS / cs;
  for (const s of snails) {
    const cx = s.position.x / cs;
    const cy = s.position.y / cs;
    const cz = s.position.z / cs;
    if (cx < bounds.min.x - pad || cx > bounds.max.x + pad) continue;
    if (cz < bounds.min.z - pad || cz > bounds.max.z + pad) continue;
    if (cy < bounds.min.y - pad || cy > bounds.max.y + pad) continue;
    for (let n = 0; n < MAX_PUSH_CELLS && grid.sample(s.position) < SNAIL_RADIUS; n++) {
      s.position = { ...s.position, y: s.position.y + cs };
    }
  }
}
