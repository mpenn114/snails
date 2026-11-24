import { registerCombat } from '../combat/combat.js';
import { buildMatchContent, type MatchContent } from '../content/match-content.js';
import type { ContentRegistry } from '../content/registry.js';
import type { AreaDefinition, StatusDefinition, WeaponDefinition } from '../content/types.js';
import { moveCommandHandler, movementSystem } from '../movement/movement.js';
import { facingToward } from '../entities/snail.js';
import { RngStreams } from '../rng-streams.js';
import { registerHazards } from '../rules/hazards.js';
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
import { DEFAULT_WIND_CONFIG, type WindConfig } from './wind.js';

/** One team in {@link MatchOptions}; snail ids are `<teamId>:<index>`. */
export interface MatchTeamOptions {
  id: string;
  name: string;
  colour: string;
  snailNames: string[];
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

function buildTeams(teams: MatchTeamOptions[], points: Vec3[]): TeamConfig[] {
  let next = 0;
  const placed = teams.map((t) => ({
    ...t,
    spots: t.snailNames.map(() => points[next++] as Vec3),
  }));
  return placed.map((t) => ({
    id: t.id,
    name: t.name,
    colour: t.colour,
    snails: t.snailNames.map((name, i) => {
      const position = t.spots[i] as Vec3;
      return { id: `${t.id}:${i}`, name, position };
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
  const total = options.teams.reduce((n, t) => n + t.snailNames.length, 0);
  const points = findSpawnPoints(grid, descriptor, total, rng.terrain, SPAWN_SPACING);
  if (points.length < total) throw new Error(`only ${points.length}/${total} spawn points found`);
  const state = createInitialState({
    seed: options.seed,
    teams: buildTeams(options.teams, points),
    terrain: descriptor,
  });
  const content = buildMatchContent(options);
  const weapons = content.weapons;
  const sim = new Simulation({ state, terrain: grid, rng, weapons });
  const turnConfig = { ...DEFAULT_TURN_CONFIG, ...options.turn };
  const windConfig = options.wind ?? DEFAULT_WIND_CONFIG;
  sim.registerCommandHandler('move', moveCommandHandler);
  sim.addSystem('movement', movementSystem(undefined, content.statuses));
  registerCombat(sim, content);
  registerHazards(sim);
  sim.addSystem('turns', turnSystem(turnConfig, windConfig));
  registerLingeringEffects(sim, content);
  faceEnemies(sim);
  startTurn(state, turnConfig, () => undefined, { rng: rng.wind, config: windConfig });
  return { sim, weapons, content, turnConfig };
}
