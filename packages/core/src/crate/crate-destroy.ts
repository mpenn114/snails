import { distance } from '../math/vec3.js';
import type { SimContext } from '../sim/types.js';
import type { Vec3 } from '../state/types.js';
import { CRATE_RADIUS } from './crate-rules.js';

/** Removes the crate with `crateId` and emits `crateDestroyed`. No-op if it is gone. */
export function destroyCrate(
  ctx: SimContext,
  crateId: string,
  reason: 'explosion' | 'water',
): void {
  const i = ctx.state.crates.findIndex((c) => c.id === crateId);
  const crate = ctx.state.crates[i];
  if (!crate) return;
  ctx.state.crates.splice(i, 1);
  ctx.emit({ type: 'crateDestroyed', crateId, position: { ...crate.position }, reason });
}

/** Destroys every crate whose box touches an explosion of `radius` at `centre` (drop order). */
export function destroyCratesInRadius(ctx: SimContext, centre: Vec3, radius: number): void {
  const hit = ctx.state.crates.filter((c) => distance(centre, c.position) - CRATE_RADIUS <= radius);
  for (const c of hit) destroyCrate(ctx, c.id, 'explosion');
}
