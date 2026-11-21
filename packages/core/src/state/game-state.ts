import type {
  GameSnapshot,
  GameState,
  Shell,
  Snail,
  Team,
  TerrainDescriptor,
  Vec3,
} from './types.js';

/** Snail config for `createInitialState`. */
export interface SnailConfig {
  id: string;
  name: string;
  position?: Vec3;
  maxHealth?: number;
  shell?: Shell;
}

/** Team config for `createInitialState`. */
export interface TeamConfig {
  id: string;
  name: string;
  colour: string;
  snails: SnailConfig[];
}

/** Options for `createInitialState`. */
export interface InitialStateOptions {
  seed: number;
  teams: TeamConfig[];
  terrain: Partial<TerrainDescriptor> & Pick<TerrainDescriptor, 'nx' | 'ny' | 'nz'>;
}

function makeSnail(teamId: string, c: SnailConfig, colour: string): Snail {
  const maxHealth = c.maxHealth ?? 100;
  return {
    id: c.id,
    teamId,
    name: c.name,
    position: { ...(c.position ?? { x: 0, y: 0, z: 0 }) },
    velocity: { x: 0, y: 0, z: 0 },
    facing: 0,
    health: maxHealth,
    maxHealth,
    alive: true,
    shell: c.shell ? { ...c.shell } : { upgradeId: null, colour },
  };
}

/** Creates a fresh game state at tick 0 with the first team/snail active. */
export function createInitialState(options: InitialStateOptions): GameState {
  const teams: Team[] = options.teams.map((t) => ({
    id: t.id,
    name: t.name,
    colour: t.colour,
    snails: t.snails.map((s) => makeSnail(t.id, s, t.colour)),
    researched: [],
  }));
  const firstTeam = teams[0];
  return {
    tick: 0,
    seed: options.seed,
    wind: { strength: 0, direction: 0 },
    terrain: { cellSize: 1, waterLevel: 0, ...options.terrain },
    teams,
    turn: {
      activeTeamId: firstTeam?.id ?? null,
      activeSnailId: firstTeam?.snails[0]?.id ?? null,
      phase: 'intro',
      timeRemaining: 0,
      turnNumber: 1,
      phaseTime: 0,
      fired: false,
    },
    projectiles: [],
    match: { status: 'playing', winnerTeamId: null },
  };
}

/** Deep copy of a game state. */
export function cloneState(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state)) as GameState;
}

/** Creates a JSON-serialisable snapshot (deep copy) of the state. */
export function createSnapshot(state: GameState): GameSnapshot {
  return cloneState(state);
}
