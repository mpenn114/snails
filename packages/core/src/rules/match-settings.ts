import { z } from 'zod';
import { RESEARCH_SETTINGS } from '../research/research-types.js';
import type { CrateRules } from '../crate/crate-rules.js';
import type { WindDefinition } from '../content/types.js';
import { DEFAULT_HAZARD_CONFIG, type HazardConfig } from './hazards.js';
import { windConfigFromDefinition, type WindConfig } from '../sim/wind.js';
import type { TurnConfig } from '../turn/turn-phases.js';
import { Rng } from '../rng.js';
import { TERRAIN_STYLES, type TerrainStyle } from '../terrain/styles/types.js';

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

/** Values of the Map setting: a concrete terrain style, or `random` (resolved from the seed). */
export const MAP_STYLE_SETTINGS = ['random', ...TERRAIN_STYLES] as const;

/** Concrete map sizes (horizontal grid edge in cells; see {@link MAP_SIZE_CELLS}). */
export const MAP_SIZES = ['small', 'medium', 'large', 'huge'] as const;
/** A concrete map size. */
export type MapSize = (typeof MAP_SIZES)[number];
/** Values of the Size setting: a concrete size, or `auto` (picked from the snail count). */
export const MAP_SIZE_SETTINGS = ['auto', ...MAP_SIZES] as const;

/** Horizontal grid edge (cells, both nx and nz) per map size: 48, 64, 80 and 96 m at 0.5 m cells. */
export const MAP_SIZE_CELLS: Record<MapSize, number> = {
  small: 96,
  medium: 128,
  large: 160,
  huge: 192,
};

/**
 * Host-chosen gameplay settings of a match (docs/game-design.md "Match settings"). Every field
 * has a default, so `MatchSettingsSchema.parse({})` is the Classic ruleset. Lobby-only concerns
 * (seed, control mode) live in the protocol's wire settings, which extend this schema.
 */
export const MatchSettingsSchema = z.object({
  /** Map style; `random` picks one style from the match seed (see {@link resolveMapStyle}). */
  mapStyle: z.enum(MAP_STYLE_SETTINGS).default('random'),
  /** Map size; `auto` scales with the total snail count (see {@link resolveMapSize}). */
  mapSize: z.enum(MAP_SIZE_SETTINGS).default('auto'),
  /** Seconds of the action phase of a turn. */
  turnTimeSeconds: z.number().int().min(10).max(120).default(30),
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

/**
 * Resolves the Map setting to one concrete terrain style. A concrete setting is returned as is;
 * `random` picks uniformly from {@link TERRAIN_STYLES} as a pure function of the seed.
 * @param setting the `mapStyle` match setting
 * @param seed the match seed (uint32)
 */
export function resolveMapStyle(
  setting: (typeof MAP_STYLE_SETTINGS)[number],
  seed: number,
): TerrainStyle {
  if (setting !== 'random') return setting;
  const rng = new Rng((seed ^ 0x5bd1e995) >>> 0);
  rng.next();
  return TERRAIN_STYLES[Math.floor(rng.next() * TERRAIN_STYLES.length)] ?? 'island';
}

/**
 * Resolves the Size setting to one concrete map size. A concrete setting is returned as is;
 * `auto` picks by total snail count: up to 6 small, 12 medium, 24 large, more huge.
 * @param setting the `mapSize` match setting
 * @param snailCount total snails in the match (teams x snails per team)
 */
export function resolveMapSize(
  setting: (typeof MAP_SIZE_SETTINGS)[number],
  snailCount: number,
): MapSize {
  if (setting !== 'auto') return setting;
  if (snailCount <= 6) return 'small';
  if (snailCount <= 12) return 'medium';
  return snailCount <= 24 ? 'large' : 'huge';
}
