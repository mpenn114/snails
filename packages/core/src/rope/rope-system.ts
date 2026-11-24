import { livingSnails } from '../entities/snail.js';
import { add, distance, normalize, sub } from '../math/vec3.js';
import { SNAIL_RADIUS } from '../physics/projectile-system.js';
import type { SimContext, SystemFn } from '../sim/types.js';
import type { Snail, Vec3 } from '../state/types.js';
import { isSphereColliding } from '../terrain/collision.js';

/** The strand only sticks when the detonation point is within this distance of terrain. */
export const ROPE_STICK_DISTANCE = 0.35;
/** Sphere radius used to keep the reeled snail out of terrain along its path. */
const CLEARANCE = SNAIL_RADIUS * 0.7;

/**
 * Starts reeling `snail` towards the terrain surface at `anchor`: it ends `standoff` metres off
 * the surface (along the surface normal) after `seconds`. Returns false (and does nothing) when
 * `anchor` is not on terrain, so a strand that flew into open air just fizzles.
 */
export function attachRope(
  ctx: SimContext,
  snail: Snail,
  anchor: Vec3,
  seconds: number,
  standoff: number,
): boolean {
  if (ctx.terrain.sampleLinear(anchor) > ROPE_STICK_DISTANCE) return false;
  const normal = ctx.terrain.normal(anchor);
  const away =
    normal.x === 0 && normal.y === 0 && normal.z === 0
      ? normalize(sub(snail.position, anchor))
      : normal;
  const to = add(anchor, { x: away.x * standoff, y: away.y * standoff, z: away.z * standoff });
  snail.rope = { anchor: { ...anchor }, from: { ...snail.position }, to, seconds, elapsed: 0 };
  snail.velocity = { x: 0, y: 0, z: 0 };
  snail.grounded = false;
  snail.airborneFromY = snail.position.y;
  ctx.emit({ type: 'ropeAttached', snailId: snail.id, anchor: { ...anchor }, seconds });
  return true;
}

function release(ctx: SimContext, snail: Snail): void {
  delete snail.rope;
  snail.velocity = { x: 0, y: 0, z: 0 };
  snail.grounded = false;
  snail.airborneFromY = snail.position.y;
  ctx.emit({ type: 'ropeReleased', snailId: snail.id });
}

/**
 * Rope system: moves every roped snail in a straight line (eased) from where it was to the
 * point near the anchor, then drops it (the movement system lands it; the fall starts at the
 * end point so the reel itself never causes fall damage). A step that would push the snail into
 * terrain ends the reel early. Register after the movement system so it has the last word.
 */
export function ropeSystem(): SystemFn {
  return (ctx) => {
    for (const snail of livingSnails(ctx.state)) {
      const rope = snail.rope;
      if (!rope) continue;
      rope.elapsed = Math.min(rope.seconds, rope.elapsed + ctx.dt);
      const t = rope.elapsed / rope.seconds;
      const k = t * t * (3 - 2 * t);
      const next = {
        x: rope.from.x + (rope.to.x - rope.from.x) * k,
        y: rope.from.y + (rope.to.y - rope.from.y) * k,
        z: rope.from.z + (rope.to.z - rope.from.z) * k,
      };
      if (isSphereColliding(ctx.terrain, next, CLEARANCE) && distance(next, rope.to) > 0.05) {
        release(ctx, snail);
        continue;
      }
      snail.position = next;
      snail.velocity = { x: 0, y: 0, z: 0 };
      snail.grounded = false;
      snail.airborneFromY = next.y;
      if (rope.elapsed >= rope.seconds) release(ctx, snail);
    }
  };
}
