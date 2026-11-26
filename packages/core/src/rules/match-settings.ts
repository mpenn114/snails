import { z } from 'zod';
import { RESEARCH_SETTINGS } from '../research/research-types.js';
import type { CrateRules } from '../crate/crate-rules.js';
import type { WindDefinition } from '../content/types.js';
import { DEFAULT_HAZARD_CONFIG, type HazardConfig } from './hazards.js';
import { windConfigFromDefinition, type WindConfig } from '../sim/wind.js';
import type { TurnConfig } from '../turn/turn-phases.js';

/** Wind presets of the Wind setting; the content wind definition id is `base:<preset>`. */
export const WIND_SETTINGS = ['off', 'low', 'normal', 'storm'] as const;
/** Crate frequency presets. */
export const CRATE_SETTINGS = ['off', 'rare', 'normal', 'frequent'] as const;
/** Sudden-death types: rising water, health drain, or both (the game-design default). */
export const SUDDEN_DEATH_TYPES = ['water', 'drain', 'both'] as const;
/** Game modes: last team standing, first capstone technology, or hold the zone. */
export const GAME_MODES = ['elimination', 'researchRace', 'kingOfTheHill'] as const;
/** Fall damage presets. */
export const FALL_DAMAGE_SETTINGS = ['off', 'on', 'high'] as const;

/**
 * Host-chosen gameplay settings of a match (docs/game-design.md "Match settings"). Every field
 * has a default, so `MatchSettingsSchema.parse({})` is the Classic ruleset. Lobby-only concerns
 * (seed, control mode) live in the protocol's wire settings, which extend this schema.
 */
export const MatchSettingsSchema = z.object({
  /** Seconds of the action phase of a turn. */
  turnTimeSeconds: z.number().int().min(10).max(120).default(45),
  /** Seconds of the retreat window after a shot. */
  retreatTimeSeconds: z.number().int().min(0).max(30).default(3),
  /** Health (and max health) every snail starts with. */
  startingHealth: z.number().int().min(1).max(500).default(100),
  /** Snails per team. */
  snailsPerTeam: z.number().int().min(1).max(8).default(3),
  /** Wind preset (strength range comes from the content wind definition). */
  wind: z.enum(WIND_SETTINGS).default('normal'),
  /** Crate drop frequency. */
  crates: z.enum(CRATE_SETTINGS).default('normal'),
  /** Most crates on the map at once. */
  crateMax: z.number().int().min(0).max(8).default(2),
  /** Round at which sudden death starts; null turns it off. */
  suddenDeathRound: z.number().int().min(1).max(99).nullable().default(20),
  /** What sudden death does. */
  suddenDeathType: z.enum(SUDDEN_DEATH_TYPES).default('both'),
  /** Metres the water rises per round once sudden death is on (water and both). */
  suddenDeathWaterRise: z.number().min(0.1).max(5).default(1),
  /** Rounds over which maximum health falls to 1 (drain and both). */
  suddenDeathDrainRounds: z.number().int().min(1).max(20).default(5),
  /** Fall damage preset. */
  fallDamage: z.enum(FALL_DAMAGE_SETTINGS).default('on'),
  /** When off, explosions do not damage teammates (self damage still applies). */
  friendlyFire: z.boolean().default(true),
  /** When on, the action timer only starts counting at the turn's first input. */
  lazyStart: z.boolean().default(false),
  /**
   * Starting stock overrides for every team (`weaponId -> uses`), replacing each weapon's `ammo`;
   * applied by `createMatch` through `initialInventory` (unknown weapon ids are ignored).
   */
  startingLoadout: z.record(z.string(), z.number().int().min(0).max(99)).default({}),
  /**
   * Weapons demo: a fixed test arena (slope, pit, ledge, rock and clay bands, water edge), every
   * weapon unlocked (all technologies researched) with 99 uses each unless `startingLoadout` says
   * otherwise, and crates on (at least the normal frequency).
   */
  demo: z.boolean().default(false),
  /** Research preset: off (classic weapons only), on, or fast (cheaper, quicker techs). */
  research: z.enum(RESEARCH_SETTINGS).default('on'),
  /** Game mode; research race forces research on and ends the match at the first capstone. */
  mode: z.enum(GAME_MODES).default('elimination'),
});

/** Parsed, fully defaulted match settings. */
export type MatchSettings = z.infer<typeof MatchSettingsSchema>;
/** Match settings as a caller may give them: every field optional. */
export type MatchSettingsInput = z.input<typeof MatchSettingsSchema>;

/** The Classic ruleset: every default. */
export const DEFAULT_MATCH_SETTINGS: MatchSettings = MatchSettingsSchema.parse({});

/** Fills defaults and validates. @throws ZodError for out-of-range or wrongly typed values. */
export function parseMatchSettings(input: MatchSettingsInput = {}): MatchSettings {
  return MatchSettingsSchema.parse(input);
}

/** Round interval between crate drops per frequency (`off` never drops). */
const CRATE_INTERVAL: Record<(typeof CRATE_SETTINGS)[number], number> = {
  off: 0,
  rare: 5,
  normal: 3,
  frequent: 2,
};

/** Turn timings from settings, on top of `base` (defaults and test overrides). */
export function turnConfigFromSettings(s: MatchSettings, base: TurnConfig): TurnConfig {
  return {
    ...base,
    actionDuration: s.turnTimeSeconds,
    retreatDuration: s.retreatTimeSeconds,
    lazyStart: s.lazyStart,
  };
}

/** Crate drop rules from settings; `off` (or max 0) yields `null`: no crates at all. */
export function crateRulesFromSettings(s: MatchSettings): CrateRules | null {
  const interval = CRATE_INTERVAL[s.crates];
  if (interval === 0 || s.crateMax === 0) return null;
  return { intervalRounds: interval, maxOnMap: s.crateMax };
}

/** Fall damage tuning per preset (off removes it, high doubles the rate and cap). */
export function hazardConfigFromSettings(s: MatchSettings): HazardConfig {
  const d = DEFAULT_HAZARD_CONFIG;
  if (s.fallDamage === 'off') return { ...d, damagePerMetre: 0, maxFallDamage: 0 };
  if (s.fallDamage === 'high') {
    return { ...d, damagePerMetre: d.damagePerMetre * 2, maxFallDamage: d.maxFallDamage * 2 };
  }
  return { ...d };
}

/**
 * Wind rules for the chosen preset, looked up as `base:<preset>` in the content wind
 * definitions; undefined when the pack has no such definition.
 */
export function windConfigFromSettings(
  s: MatchSettings,
  winds: readonly WindDefinition[],
): WindConfig | undefined {
  const def = winds.find((w) => w.id === `base:${s.wind}`);
  return def ? windConfigFromDefinition(def) : undefined;
}
