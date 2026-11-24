import { z } from 'zod';

const nonNeg = z.number().finite().nonnegative();
const pos = z.number().finite().positive();

/** Damage and knockback falloff curve. */
export const FalloffSchema = z.enum(['linear', 'quadratic', 'flat']);

/** Hurts (and pushes) living snails inside `radius` of the detonation point. */
export const DamageEffectSchema = z
  .object({
    type: z.literal('damage'),
    radius: pos,
    maxDamage: nonNeg,
    knockback: nonNeg.optional(),
    falloff: FalloffSchema.optional(),
    /** False suppresses the `explosion` event (no blast visuals or scorch); default true. */
    announce: z.boolean().optional(),
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

/**
 * Reels the firer along a strand to the surface point at the detonation point: it only attaches
 * when that point touches terrain, then pulls the firer to `standoff` metres off the surface
 * over `seconds` (see `rope/rope-system.ts`).
 */
export const ReelEffectSchema = z
  .object({ type: z.literal('reel'), seconds: pos, standoff: nonNeg })
  .strict();

/** Effects a `schedule` effect may delay (everything except `schedule` itself). */
export const BasicEffectSchema = z.discriminatedUnion('type', [
  DamageEffectSchema,
  CarveEffectSchema,
  StatusEffectSchema,
  SpawnEffectSchema,
  MoveEffectSchema,
  ReelEffectSchema,
]);

/**
 * Runs `effects` at the detonation point after `turns` turn starts, with a warning marker
 * (`telegraph`) shown meanwhile. With `line`, `count` copies are spread evenly along the
 * x axis over `length` metres, centred on the point and snapped to the ground (a barrage).
 */
export const ScheduleEffectSchema = z
  .object({
    type: z.literal('schedule'),
    turns: z.number().int().positive(),
    effects: z.array(BasicEffectSchema).min(1),
    telegraph: z.object({ radius: pos, style: z.enum(['strike', 'arrival']).optional() }).strict(),
    line: z
      .object({ count: z.number().int().min(2).max(16), length: pos })
      .strict()
      .optional(),
  })
  .strict();

/** The effect vocabulary: a small union discriminated on `type`. */
export const EffectSchema = z.discriminatedUnion('type', [
  DamageEffectSchema,
  CarveEffectSchema,
  StatusEffectSchema,
  SpawnEffectSchema,
  MoveEffectSchema,
  ReelEffectSchema,
  ScheduleEffectSchema,
]);

/** One effect run when a weapon detonates. */
export type Effect = z.infer<typeof EffectSchema>;
/** An effect that may be scheduled (any but `schedule`). */
export type BasicEffect = z.infer<typeof BasicEffectSchema>;
/** Discriminator values of {@link Effect}. */
export type EffectType = Effect['type'];
/** The effect interface for discriminator `T`. */
export type EffectOf<T extends EffectType> = Extract<Effect, { type: T }>;
