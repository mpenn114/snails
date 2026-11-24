import { z } from 'zod';

const nonNeg = z.number().finite().nonnegative();
const pos = z.number().finite().positive();

/** Damage and knockback falloff curve. */
export const FalloffSchema = z.enum(['linear', 'quadratic']);

/** Hurts (and pushes) living snails inside `radius` of the detonation point. */
export const DamageEffectSchema = z
  .object({
    type: z.literal('damage'),
    radius: pos,
    maxDamage: nonNeg,
    knockback: nonNeg.optional(),
    falloff: FalloffSchema.optional(),
  })
  .strict();

/** Removes terrain in a sphere; `collapse` drops terrain left floating. */
export const CarveEffectSchema = z
  .object({
    type: z.literal('carve'),
    radius: pos,
    collapse: z.boolean().optional(),
    /** Carve power compared with material thresholds (e.g. rock); omitted = unlimited. */
    power: z.number().nonnegative().optional(),
  })
  .strict();

/** Applies the status `statusId` to living snails inside `radius`. */
export const StatusEffectSchema = z
  .object({
    type: z.literal('status'),
    statusId: z.string().min(1),
    radius: pos,
    turns: z.number().int().positive().optional(),
    magnitude: pos.optional(),
  })
  .strict();

/** What a `spawn` effect creates: a lingering area, or sub-projectiles of another weapon. */
export const SpawnWhatSchema = z.discriminatedUnion('what', [
  z
    .object({
      what: z.literal('area'),
      areaId: z.string().min(1),
      radius: pos.optional(),
      turns: z.number().int().positive().optional(),
    })
    .strict(),
  z
    .object({
      what: z.literal('projectiles'),
      weaponId: z.string().min(1),
      count: z.number().int().positive().max(32),
      speed: pos,
      /** Half-angle of the upward cone in radians (default pi/6). */
      spread: nonNeg.optional(),
    })
    .strict(),
]);

/** Creates an area or sub-projectiles at the detonation point. */
export const SpawnEffectSchema = z
  .object({ type: z.literal('spawn'), spawn: SpawnWhatSchema })
  .strict();

/** Repositions the firer: `teleport` puts it at the detonation point (plus `lift` metres). */
export const MoveEffectSchema = z
  .object({ type: z.literal('move'), mode: z.enum(['teleport']), lift: nonNeg.optional() })
  .strict();

/** The effect vocabulary: a small union discriminated on `type`. */
export const EffectSchema = z.discriminatedUnion('type', [
  DamageEffectSchema,
  CarveEffectSchema,
  StatusEffectSchema,
  SpawnEffectSchema,
  MoveEffectSchema,
]);

/** One effect run when a weapon detonates. */
export type Effect = z.infer<typeof EffectSchema>;
/** Discriminator values of {@link Effect}. */
export type EffectType = Effect['type'];
/** The effect interface for discriminator `T`. */
export type EffectOf<T extends EffectType> = Extract<Effect, { type: T }>;
