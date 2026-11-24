import { z } from 'zod';
import { TechEffectSchema, TechVisualSchema } from '../research/research-types.js';
import { MotionSchema } from '../physics/motion.js';
import { EffectSchema } from './effects/effect-schemas.js';

const nonNeg = z.number().finite().nonnegative();
const pos = z.number().finite().positive();
const posInt = z.number().int().positive();

/** Pack-qualified content id: `pack:kebab-name`, e.g. `base:salt-shaker`. */
export const QualifiedIdSchema = z.string().regex(/^[a-z0-9]+:[a-z0-9]+(-[a-z0-9]+)*$/, {
  message: 'must look like "pack:kebab-name"',
});

/** Weapon category: selects how the weapon is aimed and which motion it normally uses. */
export const WeaponCategorySchema = z.enum([
  'projectile',
  'thrown',
  'bouncing',
  'guided',
  'area',
  'digger',
  'melee',
  'utility',
  'special',
]);

/** Launch parameters that drive projectile motion (metres, m/s). */
export const WeaponLaunchSchema = z
  .object({
    /** Launch speed at zero charge. */
    minSpeed: pos,
    /** Launch speed at full charge. */
    maxSpeed: pos,
    /** Multiplier on world gravity. */
    gravityScale: nonNeg,
    /** Multiplier on wind acceleration (light weapons use 2). */
    windScale: nonNeg,
    /** Projectile collision radius. */
    projectileRadius: pos,
  })
  .strict()
  .refine((l) => l.maxSpeed >= l.minSpeed, { message: 'maxSpeed must be >= minSpeed' });

/** Cluster pattern: `count` projectiles fanned over +-`spread` radians (scaled by power if set). */
export const WeaponPatternSchema = z
  .object({
    count: z.number().int().min(2).max(32),
    spread: nonNeg,
    spreadByPower: z.boolean().optional(),
  })
  .strict();

/** Weapon definition. Fully data-driven: no weapon-specific code paths exist in the sim. */
export const WeaponSchema = z
  .object({
    id: QualifiedIdSchema,
    name: z.string().min(1),
    category: WeaponCategorySchema,
    launch: WeaponLaunchSchema,
    /** Fuse in seconds; 0 = detonate on impact. */
    fuseSeconds: nonNeg,
    pattern: WeaponPatternSchema.optional(),
    motion: MotionSchema.optional(),
    /** Run, in order, when the weapon (or each pattern projectile) detonates. */
    effects: z.array(EffectSchema).min(1),
    /** Uses per match, or `'infinite'`. */
    ammo: z.union([z.number().int().nonnegative(), z.literal('infinite')]),
    /** Technology id required to unlock; absent = available from the start. */
    requiresTech: z.string().min(1).optional(),
    /** Maximum uses per turn (default 1). */
    perTurn: posInt.optional(),
    /**
     * Melee delivery: no projectile; `effects` run at a point `reach` metres in front of the
     * firer along the facing, and the firer is never hurt by them.
     */
    melee: z.object({ reach: pos }).strict().optional(),
    /** False for weapons that do not end the action phase when used (utilities); default true. */
    endsAction: z.boolean().optional(),
  })
  .strict();

/** What a crate gives the snail that opens it. */
export const CrateContentsSchema = z
  .object({
    /** Health restored. */
    heal: posInt.optional(),
    /** Weapon stock added (weapon ids). */
    weapons: z.array(z.object({ weaponId: z.string().min(1), count: posInt }).strict()).optional(),
    /** Calcium (research resource) granted. */
    calcium: posInt.optional(),
    /** Status applied to the opener (good or bad, for mystery crates). */
    statusId: z.string().min(1).optional(),
  })
  .strict();

/** Crate definition. Drop gameplay is a later job; this is only the data. */
export const CrateSchema = z
  .object({
    id: QualifiedIdSchema,
    name: z.string().min(1),
    kind: z.enum(['supply', 'health', 'utility', 'calcium', 'mystery']),
    /** Relative drop chance among crates (> 0). */
    weight: pos,
    contents: CrateContentsSchema,
  })
  .strict();

/** Wind setting preset (Off, Low, Normal, Storm). Strengths are in m/s^2. */
export const WindSchema = z
  .object({
    id: QualifiedIdSchema,
    name: z.string().min(1),
    minStrength: nonNeg,
    maxStrength: nonNeg,
    /** Storm: wind is re-rolled while projectiles are in flight. */
    changesMidFlight: z.boolean(),
  })
  .strict()
  .refine((w) => w.maxStrength >= w.minStrength, { message: 'maxStrength must be >= minStrength' });

/** Status carried by a snail (salt, goo, ...). Handled generically at turn start. */
export const StatusSchema = z
  .object({
    id: QualifiedIdSchema,
    name: z.string().min(1),
    /** Damage dealt at the start of each of the afflicted snail's team's turns (x magnitude). */
    perTurnDamage: nonNeg.optional(),
    /** Crawl speed multiplier while afflicted (default 1). */
    moveSpeedMultiplier: nonNeg.optional(),
    /** Duration in turns when the applying effect gives none (default 1). */
    defaultTurns: posInt.optional(),
    /** Ids of statuses removed when this one is applied. */
    cures: z.array(z.string().min(1)).optional(),
  })
  .strict();

/** Lingering area (spore cloud, puddle, goo). Handled generically at every turn start. */
export const AreaSchema = z
  .object({
    id: QualifiedIdSchema,
    name: z.string().min(1),
    defaultRadius: pos,
    /** Lifetime in turns (each turn start of any team counts one). */
    defaultTurns: posInt,
    /** Damage to each living snail inside, per turn start. */
    perTurnDamage: nonNeg.optional(),
    /** Status applied to each living snail inside, per turn start. */
    applyStatus: z
      .object({
        statusId: z.string().min(1),
        turns: posInt.optional(),
        magnitude: pos.optional(),
      })
      .strict()
      .optional(),
    /** Metres the area drifts downwind per turn per unit of wind strength (0 = fixed). */
    windDrift: nonNeg.optional(),
    /** Snails inside drown (die with cause `drown`). */
    drowns: z.boolean().optional(),
    /**
     * Makes the area a body of water: on spawn its centre settles to the lowest terrain within
     * its radius and the surface (`position.y`) is `waterDepth` metres above that point, capped at
     * the lowest point of the rim (so flat ground only gets a thin film). With `drowns`, only
     * snails whose centre is below the surface drown.
     */
    waterDepth: pos.optional(),
    /** Status ids removed from snails touching the area (water puts out salt). */
    extinguishes: z.array(z.string().min(1)).optional(),
  })
  .strict();

/** Technology node. */
export const TechnologySchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    branch: z.enum(['weaponry', 'shell', 'mobility', 'utility']),
    tier: z.number().int().nonnegative(),
    cost: nonNeg,
    prerequisites: z.array(z.string().min(1)),
    description: z.string(),
    /** At least one of these must be researched too (an "A or B" prerequisite). */
    anyOf: z.array(z.string().min(1)).optional(),
    /** Team turns of research (1 to 3); omitted means 1. */
    researchTurns: z.number().int().min(1).max(3).optional(),
    /** Tier 4 capstone: one per team, and the Research race objective. */
    capstone: z.boolean().optional(),
    /** What completing the tech does; omitted means nothing beyond unlocking gated content. */
    effects: z.array(TechEffectSchema).optional(),
    /** Visible change on the team's snails. */
    visual: TechVisualSchema.optional(),
  })
  .strict();

/** Shell upgrade. */
export const ShellUpgradeSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    /** Flat damage reduction applied to incoming damage. */
    armor: nonNeg,
    /** Visual material hint for the renderer. */
    material: z.string().min(1),
    requiresTech: z.string().min(1).optional(),
  })
  .strict();

/** Semver `x.y.z`. */
const SemverSchema = z.string().regex(/^\d+\.\d+\.\d+$/, { message: 'must be semver x.y.z' });

/** Manifest describing a content pack. `dependencies` maps pack id to a semver range. */
export const ContentPackManifestSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9]+$/, { message: 'pack ids are lowercase alphanumeric' }),
    name: z.string().min(1),
    version: SemverSchema,
    author: z.string().optional(),
    dependencies: z.record(z.string()).optional(),
  })
  .strict();

/** Weapon definition. */
export type WeaponDefinition = z.infer<typeof WeaponSchema>;
/** Weapon category. */
export type WeaponCategory = z.infer<typeof WeaponCategorySchema>;
/** Weapon launch parameters. */
export type WeaponLaunchSpec = z.infer<typeof WeaponLaunchSchema>;
/** Weapon cluster pattern. */
export type WeaponPattern = z.infer<typeof WeaponPatternSchema>;
/** Crate definition. */
export type CrateDefinition = z.infer<typeof CrateSchema>;
/** Wind preset definition. */
export type WindDefinition = z.infer<typeof WindSchema>;
/** Status definition. */
export type StatusDefinition = z.infer<typeof StatusSchema>;
/** Area definition. */
export type AreaDefinition = z.infer<typeof AreaSchema>;
/** Technology definition. */
export type TechnologyDefinition = z.infer<typeof TechnologySchema>;
/** Shell upgrade definition. */
export type ShellUpgradeDefinition = z.infer<typeof ShellUpgradeSchema>;
/** Content pack manifest. */
export type ContentPackManifest = z.infer<typeof ContentPackManifestSchema>;
