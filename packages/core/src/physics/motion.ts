import { z } from 'zod';
import type { Wind } from '../state/types.js';
import { type ProjectileState, stepProjectile } from './ballistics.js';
import { BounceMotionSchema, bounceStrategy } from './motion-bounce.js';
import { DrillMotionSchema, drillStrategy } from './motion-drill.js';
import type { MotionStrategy } from './motion-types.js';

export type { ContactResponse, MotionStrategy, TerrainContact } from './motion-types.js';

/** Plain gravity-and-wind arc (the default motion). */
export const BallisticMotionSchema = z.object({ kind: z.literal('ballistic') }).strict();

/**
 * Motion of a weapon's projectile, discriminated by `kind`. To add a motion (`bounce`,
 * `guided`, `drill`, ...): add its schema to this union and one entry to {@link motionStrategies}.
 */
export const MotionSchema = z.discriminatedUnion('kind', [
  BallisticMotionSchema,
  BounceMotionSchema,
  DrillMotionSchema,
]);

/** Motion parameters of a weapon or projectile. */
export type MotionSpec = z.infer<typeof MotionSchema>;

/** Discriminator values of {@link MotionSpec}. */
export type MotionKind = MotionSpec['kind'];

/** The motion strategy table, keyed by `motion.kind`. Adding a motion is an additive entry. */
export const motionStrategies: {
  [K in MotionKind]: MotionStrategy<Extract<MotionSpec, { kind: K }>>;
} = {
  ballistic: { step: (p, _motion, wind, dt) => stepProjectile(p, wind, dt) },
  bounce: bounceStrategy,
  drill: drillStrategy,
};

/** Motion used when a projectile carries none. */
export const DEFAULT_MOTION: MotionSpec = { kind: 'ballistic' };

/** Advances a projectile one step with the strategy for its motion kind (ballistic if unset). */
export function stepMotion(
  p: ProjectileState & { motion?: MotionSpec | undefined },
  wind: Wind,
  dt: number,
): ProjectileState {
  const { motion, strategy } = resolveMotion(p.motion);
  return strategy.step(p, motion, wind, dt);
}

/** The strategy and parameters for a motion (ballistic if unset). */
export function resolveMotion(motion: MotionSpec | undefined): {
  motion: MotionSpec;
  strategy: MotionStrategy<MotionSpec>;
} {
  const m = motion ?? DEFAULT_MOTION;
  return { motion: m, strategy: motionStrategies[m.kind] as MotionStrategy<MotionSpec> };
}
