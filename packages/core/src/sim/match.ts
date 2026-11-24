import { initialInventory } from '../combat/inventory.js';
import { registerCombat } from '../combat/combat.js';
import { buildMatchContent, type MatchContent } from '../content/match-content.js';
import type { ContentRegistry } from '../content/registry.js';
import type {
  AreaDefinition,
  CrateDefinition,
  StatusDefinition,
  WeaponDefinition,
  WindDefinition,
} from '../content/types.js';
import { DEFAULT_CRATE_RULES, type CrateRules } from '../crate/crate-rules.js';
import { registerCrates } from '../crate/crate-system.js';
import { moveCommandHandler, movementSystem } from '../movement/movement.js';
import { snailSeparationSystem } from '../movement/snail-collision.js';
import { facingToward } from '../entities/snail.js';
import { RngStreams } from '../rng-streams.js';
import { registerHazards } from '../rules/hazards.js';
import {
  crateRulesFromSettings,
  hazardConfigFromSettings,
  parseMatchSettings,
  turnConfigFromSettings,
  windConfigFromSettings,
  type MatchSettings,
  type MatchSettingsInput,
} from '../rules/match-settings.js';
import { registerSuddenDeath } from '../rules/sudden-death.js';
import { createInitialState, type TeamConfig } from '../state/game-state.js';
import type { Vec3 } from '../state/types.js';
import { DEFAULT_TERRAIN_CONFIG, findSpawnPoints, generateTerrain } from '../terrain/generator.js';
import type { TerrainGenConfig } from '../terrain/generator.js';
import {
  DEFAULT_TURN_CONFIG,
  startTurn,
  turnSystem,
  type TurnConfig,
} from '../turn/turn-phases.js';
import { registerLingeringEffects } from './lingering.js';
import { Simulation } from './simulation.js';
import { DEFAULT_WIND_CONFIG, midFlightWindSystem, type WindConfig } from './wind.js';

/** One team in {@link MatchOptions}; snail ids are `<teamId>:<index>`. */
export interface MatchTeamOptions {
  id: string;
  name: string;
  colour: string;
  /** Names of the team's snails; default `<name> 1..n` with `settings.snailsPerTeam` of them. */
  snailNames?: string[];
}

/** Options for {@link createMatch}. */
export interface MatchOptions {
  seed: number;
  teams: MatchTeamOptions[];
  terrain?: Partial<TerrainGenConfig>;
  turn?: Partial<TurnConfig>;
  wind?: WindConfig;
  weapons: WeaponDefinition[];
  /** Status definitions effects and areas may refer to. */
  statuses?: StatusDefinition[];
  /** Area definitions `spawn` effects may refer to. */
  areas?: AreaDefinition[];
  /** Crate definitions that may drop (none = no crates). */
  crates?: CrateDefinition[];
  /** Drop interval and map cap overrides (default every 3 rounds, up to 2). */
  crateRules?: Partial<CrateRules>;
  /**
   * Starting stock overrides, `weaponId -> count`, applied to every team (replaces the weapon's
   * `ammo`; a finite count also limits an otherwise infinite weapon). Merged over the
   * `startingLoadout` setting.
   */
  loadout?: Record<string, number>;
  /**
   * Host match settings (turn and retreat time, health, wind, crates, sudden death, fall damage,
   * friendly fire, lazy start, snails per team, starting loadout). Omitted fields default to
   * Classic. Explicit `turn`, `wind` and `crateRules` options win over the settings.
   */
  settings?: MatchSettingsInput;
  /** Wind definitions the `wind` setting picks from (`base:<preset>`); without them it is ignored. */
  winds?: readonly WindDefinition[];
}

/** Result of {@link createMatch}. */
export interface MatchSetup {
  sim: Simulation;
  weapons: ContentRegistry<WeaponDefinition>;
  /** All frozen match registries (weapons, statuses, areas). */
  content: MatchContent;
  turnConfig: TurnConfig;
}

/** Minimum horizontal spacing (m) between spawn points. */
const SPAWN_SPACING = 4;

function namesOf(t: MatchTeamOptions, s: MatchSettings): string[] {
  return t.snailNames ?? Array.from({ length: s.snailsPerTeam }, (_, i) => `${t.name} ${i + 1}`);
}

function buildTeams(teams: MatchTeamOptions[], points: Vec3[], s: MatchSettings): TeamConfig[] {
  let next = 0;
  return teams.map((t) => ({
    id: t.id,
    name: t.name,
    colour: t.colour,
    snails: namesOf(t, s).map((name, i) => {
      const position = points[next++] as Vec3;
      return { id: `${t.id}:${i}`, name, position, maxHealth: s.startingHealth };
    }),
  }));
}

function faceEnemies(sim: Simulation): void {
  for (const team of sim.state.teams) {
    const enemies = sim.state.teams.filter((t) => t.id !== team.id).flatMap((t) => t.snails);
    if (enemies.length === 0) continue;
    const cx = enemies.reduce((a, e) => a + e.position.x, 0) / enemies.length;
    const cz = enemies.reduce((a, e) => a + e.position.z, 0) / enemies.length;
    for (const s of team.snails) s.facing = facingToward(s.position, { x: cx, y: 0, z: cz });
  }
}

/** Registers crates (per settings) and sudden death, in that order, after lingering effects. */
function registerMatchRules(
  sim: Simulation,
  content: MatchContent,
  settings: MatchSettings,
  override: Partial<CrateRules> | undefined,
): void {
  const crates = override
    ? { ...DEFAULT_CRATE_RULES, ...override }
    : crateRulesFromSettings(settings);
  if (crates) registerCrates(sim, content, crates);
  if (settings.suddenDeathRound !== null) {
    registerSuddenDeath(sim, {
      startRound: settings.suddenDeathRound,
      kind: settings.suddenDeathType,
      waterRisePerRound: settings.suddenDeathWaterRise,
      drainRounds: settings.suddenDeathDrainRounds,
    });
  }
}

/**
 * Builds a ready-to-run match: generates terrain from the `terrain` RNG stream, places snails
 * on spawn points (facing the enemy centroid), registers handlers and systems in order
 * (commands, movement, projectiles/combat, hazards, turns), freezes the weapon registry and
 * starts the first turn with a rolled wind.
 * @throws Error if the terrain has too few spawn points for all snails.
 */
export function createMatch(options: MatchOptions): MatchSetup {
  const rng = new RngStreams(options.seed);
  const config: TerrainGenConfig = { ...DEFAULT_TERRAIN_CONFIG, ...options.terrain };
  const { grid, descriptor } = generateTerrain(config, rng.terrain);
  const settings = parseMatchSettings(options.settings);
  const total = options.teams.reduce((n, t) => n + namesOf(t, settings).length, 0);
  const points = findSpawnPoints(grid, descriptor, total, rng.terrain, SPAWN_SPACING);
  if (points.length < total) throw new Error(`only ${points.length}/${total} spawn points found`);
  const state = createInitialState({
    seed: options.seed,
    teams: buildTeams(options.teams, points, settings),
    terrain: descriptor,
  });
  const loadout = { ...settings.startingLoadout, ...options.loadout };
  for (const team of state.teams) team.inventory = initialInventory(options.weapons, loadout);
  const content = buildMatchContent(options);
  const weapons = content.weapons;
  const sim = new Simulation({ state, terrain: grid, rng, weapons });
  const turnConfig = {
    ...turnConfigFromSettings(settings, DEFAULT_TURN_CONFIG),
    ...options.turn,
  };
  const windConfig =
    options.wind ?? windConfigFromSettings(settings, options.winds ?? []) ?? DEFAULT_WIND_CONFIG;
  if (!settings.friendlyFire) state.rules = { friendlyFire: false };
  sim.registerCommandHandler('move', moveCommandHandler);
  sim.addSystem('movement', movementSystem(undefined, content.statuses));
  sim.addSystem('snailSeparation', snailSeparationSystem());
  registerCombat(sim, content);
  registerHazards(sim, hazardConfigFromSettings(settings));
  sim.addSystem('turns', turnSystem(turnConfig, windConfig));
  if (windConfig.changesMidFlight === true) sim.addSystem('wind', midFlightWindSystem(windConfig));
  registerLingeringEffects(sim, content);
  registerMatchRules(sim, content, settings, options.crateRules);
  faceEnemies(sim);
  startTurn(state, turnConfig, () => undefined, { rng: rng.wind, config: windConfig });
  return { sim, weapons, content, turnConfig };
}
