import { z } from 'zod';
import type { Wind } from '../state/types.js';
import { type ProjectileState, stepProjectile } from './ballistics.js';

/** Plain gravity-and-wind arc (the default motion). */
export const BallisticMotionSchema = z.object({ kind: z.literal('ballistic') }).strict();

/**
 * Motion of a weapon's projectile, discriminated by `kind`. To add a motion (`bounce`,
 * `guided`, `drill`, ...): add its schema to this union and one entry to {@link motionStrategies}.
 */
export const MotionSchema = z.discriminatedUnion('kind', [BallisticMotionSchema]);

/** Motion parameters of a weapon or projectile. */
export type MotionSpec = z.infer<typeof MotionSchema>;

/** Discriminator values of {@link MotionSpec}. */
export type MotionKind = MotionSpec['kind'];

/** How one motion kind advances a projectile by one fixed step. Pure and deterministic. */
export interface MotionStrategy<M extends MotionSpec = MotionSpec> {
  /** Returns the projectile state after `dt` seconds. */
  step(p: ProjectileState, motion: M, wind: Wind, dt: number): ProjectileState;
}

/** The motion strategy table, keyed by `motion.kind`. Adding a motion is an additive entry. */
export const motionStrategies: {
  [K in MotionKind]: MotionStrategy<Extract<MotionSpec, { kind: K }>>;
} = {
  ballistic: { step: (p, _motion, wind, dt) => stepProjectile(p, wind, dt) },
};

/** Motion used when a projectile carries none. */
export const DEFAULT_MOTION: MotionSpec = { kind: 'ballistic' };

/** Advances a projectile one step with the strategy for its motion kind (ballistic if unset). */
export function stepMotion(
  p: ProjectileState & { motion?: MotionSpec | undefined },
  wind: Wind,
  dt: number,
): ProjectileState {
  const motion = p.motion ?? DEFAULT_MOTION;
  const strategy = motionStrategies[motion.kind] as MotionStrategy;
  return strategy.step(p, motion, wind, dt);
}
