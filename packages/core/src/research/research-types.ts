import { z } from 'zod';

/**
 * Shared research contracts (docs/technology-research.md). The research systems (economy, queue,
 * effects) live beside this file in `research/`; this file only fixes the data shapes.
 */

/** Research presets of the match settings: off (classic weapons only), on, or fast. */
export const RESEARCH_SETTINGS = ['off', 'on', 'fast'] as const;
/** One research preset. */
export type ResearchSetting = (typeof RESEARCH_SETTINGS)[number];

/** A tech being researched: Calcium is paid when work begins. */
export interface ResearchJob {
  techId: string;
  /** Team turns of work left (counts down at the owning team's turn start). */
  turnsLeft: number;
  /** Calcium paid when work began (cancel refunds 50%). */
  paid: number;
}

/** Private research state of one team (opponents see only `researched` and a shimmer). */
export interface TeamResearch {
  /** Banked Calcium. */
  calcium: number;
  /** Tech ids waiting to start, in order (free to edit until work begins). */
  queue: string[];
  /** The tech currently being researched, if any. */
  active: ResearchJob | null;
  /** Damage-based Calcium earned during the current turn (for the per-turn cap). */
  damageCalciumThisTurn: number;
  /** Rounds since this team last damaged an enemy snail (Moss Tax). */
  roundsSinceDamage: number;
  /** Uses of once-per-match abilities, `abilityId -> uses spent`. */
  abilityUses?: Record<string, number>;
}

/** Stats a tech can modify for its team (extend the list when a tech needs a new one). */
export const TECH_STATS = [
  'maxHealth',
  'blastDamageTaken',
  'damageDealt',
  'moveBudgetSeconds',
  'crawlSpeed',
  'maxClimbDegrees',
  'jumpCharges',
  'jumpDistance',
  'calciumPerTurn',
  'meleeDamage',
  'meleeThorns',
  'retreatDamageTaken',
  'projectileReflect',
  'healPerStillTurn',
  'stockBonus',
  'fallDamageTaken',
] as const;
/** One modifiable stat. */
export type TechStat = (typeof TECH_STATS)[number];

const num = z.number().finite();

/** Closed vocabulary of tech effects; the AI and UI reason about these (no code branches). */
export const TechEffectSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('modifyStat'),
    stat: z.enum(TECH_STATS),
    op: z.enum(['add', 'mul']),
    value: num,
  }),
  z.object({
    type: z.literal('modifyWeapon'),
    weaponId: z.string().min(1),
    stat: z.enum(['damage', 'radius']),
    op: z.enum(['add', 'mul']),
    value: num,
  }),
  z.object({
    type: z.literal('unlockWeapon'),
    weaponId: z.string().min(1),
    /** Stock granted on completion (omitted: the weapon's own `ammo`). */
    stock: z.number().int().nonnegative().optional(),
  }),
  z.object({
    type: z.literal('grantStock'),
    weaponId: z.string().min(1),
    amount: z.number().int().positive(),
    /** Repeat the grant every N rounds after completion. */
    everyRounds: z.number().int().positive().optional(),
  }),
  z.object({ type: z.literal('heal'), amount: z.number().int().positive() }),
  z.object({ type: z.literal('addAbility'), abilityId: z.string().min(1) }),
  z.object({ type: z.literal('setFlag'), flag: z.string().min(1) }),
  z.object({ type: z.literal('hook'), hookId: z.string().min(1) }),
]);
/** One tech effect. */
export type TechEffect = z.infer<typeof TechEffectSchema>;

/** Visible change a completed tech makes to the team's snails (docs/snail-visuals.md). */
export const TechVisualSchema = z
  .object({
    shellMaterial: z.enum(['chalky', 'calcified', 'iron', 'crystal']).optional(),
    attachments: z.array(z.string().min(1)).optional(),
    glow: z.string().min(1).optional(),
  })
  .strict();
/** Tech visual payload. */
export type TechVisual = z.infer<typeof TechVisualSchema>;
