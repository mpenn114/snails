import { z } from 'zod';
import type { SimContext } from '../sim/types.js';
import type { Vec3 } from '../state/types.js';
import { carveSphere, toCarveEvent } from '../terrain/carve.js';
import type { MotionStrategy } from './motion-types.js';

/**
 * Drill motion: straight flight at constant speed with gravity and wind ignored, carving a tube
 * of `tubeRadius` metres around its tip with carve `power`, for `length` metres. Terrain that
 * survives the carve (rock when `power` is below its threshold) stops the drill silently.
 */
export const DrillMotionSchema = z
  .object({
    kind: z.literal('drill'),
    length: z.number().finite().positive(),
    tubeRadius: z.number().finite().positive(),
    power: z.number().finite().nonnegative(),
  })
  .strict();

/** Motion parameters of `drill`. */
export type DrillMotion = z.infer<typeof DrillMotionSchema>;

function carveTube(ctx: SimContext, at: Vec3, motion: DrillMotion): void {
  const carve = carveSphere(ctx.terrain, at, motion.tubeRadius, motion.power);
  if (carve.cellsChanged === 0) return;
  ctx.emit({
    type: 'terrainCarved',
    ...toCarveEvent(at, motion.tubeRadius, carve, motion.power),
  });
}

/** The `drill` strategy. Distance travelled is `age * speed` (speed never changes). */
export const drillStrategy: MotionStrategy<DrillMotion> = {
  step: (p, _motion, _wind, dt) => ({
    ...p,
    position: {
      x: p.position.x + p.velocity.x * dt,
      y: p.position.y + p.velocity.y * dt,
      z: p.position.z + p.velocity.z * dt,
    },
  }),
  prepare(ctx, p, motion, next) {
    if (p.age === 0) carveTube(ctx, p.position, motion);
    carveTube(ctx, next.position, motion);
  },
  onTerrainContact: () => ({ action: 'expire' }),
  finished(p, motion) {
    const speed = Math.hypot(p.velocity.x, p.velocity.y, p.velocity.z);
    return p.age * speed >= motion.length;
  },
  previewRange: (motion) => motion.length,
};
