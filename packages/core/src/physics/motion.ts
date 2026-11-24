import { z } from 'zod';
import type { Wind } from '../state/types.js';
import { type ProjectileState, stepProjectile } from './ballistics.js';
import { BounceMotionSchema, bounceStrategy } from './motion-bounce.js';
import { DrillMotionSchema, drillStrategy } from './motion-drill.js';
import type { MotionInput, MotionStrategy } from './motion-types.js';

export type {
  ContactResponse,
  MotionInput,
  MotionStrategy,
  TerrainContact,
} from './motion-types.js';

/** Plain gravity-and-wind arc (the default motion). */
export const BallisticMotionSchema = z.object({ kind: z.literal('ballistic') }).strict();

/**
 * Guided motion: for `guidanceSeconds` after launch the owner's steering input (-1..1, stored on
 * the projectile as `steer`) turns the velocity vector at `steerRate` rad/s in the screen (XY)
 * plane: positive input turns clockwise as seen side-on (+X right, +Y up), negative
 * counter-clockwise. After the window the projectile flies ballistically.
 */
export const GuidedMotionSchema = z
  .object({
    kind: z.literal('guided'),
    steerRate: z.number().finite().positive(),
    guidanceSeconds: z.number().finite().positive(),
  })
  .strict();

/**
 * Motion of a weapon's projectile, discriminated by `kind`. To add a motion (`bounce`,
 * `guided`, `drill`, ...): add its schema to this union and one entry to {@link motionStrategies}.
 */
export const MotionSchema = z.discriminatedUnion('kind', [
  BallisticMotionSchema,
  GuidedMotionSchema,
  BounceMotionSchema,
  DrillMotionSchema,
]);

/** Motion parameters of a weapon or projectile. */
export type MotionSpec = z.infer<typeof MotionSchema>;

/** Discriminator values of {@link MotionSpec}. */
export type MotionKind = MotionSpec['kind'];

/** True while a guided projectile still accepts steering. */
export function isGuidable(p: { motion?: MotionSpec | undefined; age?: number }): boolean {
  return p.motion?.kind === 'guided' && (p.age ?? 0) < p.motion.guidanceSeconds;
}

/** The motion strategy table, keyed by `motion.kind`. Adding a motion is an additive entry. */
export const motionStrategies: {
  [K in MotionKind]: MotionStrategy<Extract<MotionSpec, { kind: K }>>;
} = {
  ballistic: { step: (p, _motion, wind, dt) => stepProjectile(p, wind, dt) },
  guided: {
    step: (p, motion, wind, dt) => {
      const steer = isGuidable({ motion, age: p.age }) ? (p.steer ?? 0) : 0;
      if (steer === 0) return stepProjectile(p, wind, dt);
      const a = -motion.steerRate * steer * dt;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const { x, y } = p.velocity;
      const turned = { ...p, velocity: { x: x * c - y * s, y: x * s + y * c, z: p.velocity.z } };
      return stepProjectile(turned, wind, dt);
    },
  },
  bounce: bounceStrategy,
  drill: drillStrategy,
};

/** Motion used when a projectile carries none. */
export const DEFAULT_MOTION: MotionSpec = { kind: 'ballistic' };

/** Advances a projectile one step with the strategy for its motion kind (ballistic if unset). */
export function stepMotion(
  p: MotionInput & { motion?: MotionSpec | undefined },
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
