import type { ContentRegistry } from '../content/registry.js';
import type { AreaDefinition } from '../content/types.js';
import { kill, livingSnails } from '../entities/snail.js';
import { SNAIL_RADIUS } from '../physics/projectile-system.js';
import type { SimContext } from '../sim/types.js';
import { removeStatus } from '../status/status-system.js';
import type { AreaInstance, Vec3 } from '../state/types.js';
import { rayCast } from '../terrain/collision.js';
import type { SdfQuery } from '../terrain/collision.js';

/** Ring fractions of the area radius (8 columns per ring) probed for the low point. */
const RING_FRACTIONS = [0.5, 1];
const RING_DIRECTIONS = 8;
/** A probe must be this much lower (m) than the best so far, so noise on flat ground is ignored. */
const LOWER_BY = 0.05;

/**
 * Where a water area of `radius` settles when dropped at `at`: the lowest terrain point found
 * by probing the centre and two rings of 8 columns inside the radius (ties keep the earlier
 * probe, the centre first). Returns that ground point; falls back to `at` when no probe finds
 * ground within reach.
 */
export function findLowPoint(terrain: SdfQuery, at: Vec3, radius: number): Vec3 {
  const probes: [number, number][] = [[0, 0]];
  for (const f of RING_FRACTIONS) {
    for (let i = 0; i < RING_DIRECTIONS; i++) {
      const a = (2 * Math.PI * i) / RING_DIRECTIONS;
      probes.push([Math.cos(a) * radius * f, Math.sin(a) * radius * f]);
    }
  }
  let best: Vec3 | null = null;
  for (const [dx, dz] of probes) {
    const from = { x: at.x + dx, y: at.y + radius, z: at.z + dz };
    const hit = rayCast(terrain, from, { x: 0, y: -1, z: 0 }, 2 * radius + 2);
    if (!hit || hit.distance <= 0) continue;
    if (best === null || hit.point.y < best.y - LOWER_BY) best = hit.point;
  }
  return best ?? { ...at };
}

/** Probes around the rim of a puddle (columns on the circle of the full radius). */
const RIM_PROBES = 16;
/** A puddle always wets the ground a little, so it still puts out salt on flat ground. */
export const MIN_WATER_FILM = 0.2;

/**
 * Surface height of a water area of `radius` and `depth` whose lowest ground point is `low`:
 * `depth` above the low point, but never above the lowest point of the surrounding rim (the
 * water would spill over it) and never under a thin wet film. On flat ground the rim is as low
 * as the floor, so the puddle is a film nobody drowns in; in a real dip it is `depth` deep.
 */
export function waterSurfaceY(terrain: SdfQuery, low: Vec3, radius: number, depth: number): number {
  let rim = Number.POSITIVE_INFINITY;
  for (let i = 0; i < RIM_PROBES; i++) {
    const a = (2 * Math.PI * i) / RIM_PROBES;
    const from = {
      x: low.x + Math.cos(a) * radius,
      y: low.y + radius + depth,
      z: low.z + Math.sin(a) * radius,
    };
    const hit = rayCast(terrain, from, { x: 0, y: -1, z: 0 }, 2 * radius + depth + 2);
    if (hit && hit.distance > 0) rim = Math.min(rim, hit.point.y);
  }
  const top = Math.min(low.y + depth, rim);
  return Math.max(low.y + MIN_WATER_FILM, top);
}

/** True when the area definition describes a body of water (`waterDepth` set). */
export function isWaterArea(def: AreaDefinition | undefined): def is AreaDefinition {
  return def?.waterDepth !== undefined;
}

/**
 * Lets a water area act on the snails it touches: snails whose feet are in the water lose the
 * statuses in `extinguishes`; if `drowns` is set, snails inside its radius whose centre is
 * below the surface (`area.position.y`) drown (`snailDrowned`, `snailDied` cause `drown`).
 */
export function applyWater(ctx: SimContext, area: AreaInstance, def: AreaDefinition): void {
  for (const snail of livingSnails(ctx.state)) {
    const flat = Math.hypot(snail.position.x - area.position.x, snail.position.z - area.position.z);
    if (flat > area.radius + SNAIL_RADIUS) continue;
    if (snail.position.y - SNAIL_RADIUS > area.position.y) continue;
    for (const id of def.extinguishes ?? []) removeStatus(ctx, snail, id);
    if (def.drowns === true && flat <= area.radius && snail.position.y < area.position.y) {
      kill(snail);
      ctx.emit({ type: 'snailDrowned', snailId: snail.id });
      ctx.emit({ type: 'snailDied', snailId: snail.id, teamId: snail.teamId, cause: 'drown' });
    }
  }
}

/**
 * Per-step system: water areas drown or extinguish snails that fall or crawl in between turn
 * starts. Cheap: it loops over `state.areas`, which is empty most of the time.
 */
export function waterAreaSystem(areas: ContentRegistry<AreaDefinition>): (ctx: SimContext) => void {
  return (ctx) => {
    for (const area of ctx.state.areas) {
      const def = areas.get(area.kind);
      if (isWaterArea(def)) applyWater(ctx, area, def);
    }
  };
}
