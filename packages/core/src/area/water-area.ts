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
