import { z } from 'zod';
import type { Vec3 } from '../state/types.js';
import { add, dot, scale, sub } from '../math/vec3.js';
import { sphereSweep } from '../terrain/collision.js';
import { stepProjectile } from './ballistics.js';
import type { MotionStrategy } from './motion-types.js';

/**
 * Bouncing and rolling motion: ballistic flight, but terrain contact reflects the velocity
 * instead of detonating. `restitution` keeps that share of the speed along the normal,
 * `friction` removes that share of the tangential speed on each real bounce, and a slow contact
 * (below {@link REST_SPEED}) becomes rolling: gravity then pulls the stone along the slope and
 * `rollDrag` (1/s) slows it. Detonation comes from the fuse or from touching a snail.
 */
export const BounceMotionSchema = z
  .object({
    kind: z.literal('bounce'),
    restitution: z.number().min(0).max(1),
    friction: z.number().min(0).max(1),
    rollDrag: z.number().finite().nonnegative().optional(),
  })
  .strict();

/** Motion parameters of `bounce`. */
export type BounceMotion = z.infer<typeof BounceMotionSchema>;

/** Normal speed (m/s) under which a contact rolls instead of bouncing. */
export const REST_SPEED = 1.6;
/** Gap in metres left between the stone and the surface after a contact. */
const SKIN = 0.005;
const DEFAULT_ROLL_DRAG = 0.35;

function reflect(v: Vec3, n: Vec3, m: BounceMotion, dt: number): Vec3 {
  const vn = dot(v, n);
  if (vn >= 0) return v;
  const tangent = sub(v, scale(n, vn));
  const inward = -vn;
  if (inward > REST_SPEED) {
    return add(scale(tangent, 1 - m.friction), scale(n, inward * m.restitution));
  }
  return scale(tangent, Math.exp(-(m.rollDrag ?? DEFAULT_ROLL_DRAG) * dt));
}

/** The `bounce` strategy: ballistic step plus a reflect-or-roll terrain response. */
export const bounceStrategy: MotionStrategy<BounceMotion> = {
  step: (p, _motion, wind, dt) => stepProjectile(p, wind, dt),
  onTerrainContact(ctx, p, motion, contact, dt) {
    const next = stepProjectile(p, ctx.state.wind, dt);
    const velocity = reflect(next.velocity, contact.normal, motion, dt);
    const depth = Math.max(0, p.radius - ctx.terrain.sampleLinear(contact.position));
    const pos = add(contact.position, scale(contact.normal, depth + SKIN));
    const target = add(pos, scale(velocity, dt * (1 - contact.t)));
    const again = sphereSweep(ctx.terrain, pos, target, p.radius);
    return { action: 'continue', position: again ? again.point : target, velocity };
  },
};
