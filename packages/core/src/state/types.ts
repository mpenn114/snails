/** 3D vector. */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Shell state of a snail. */
export interface Shell {
  upgradeId: string | null;
  colour: string;
}

/** A single snail (data only; behaviour lives elsewhere). */
export interface Snail {
  id: string;
  teamId: string;
  name: string;
  position: Vec3;
  velocity: Vec3;
  /** Facing angle in radians about +Y. */
  facing: number;
  health: number;
  maxHealth: number;
  alive: boolean;
  shell: Shell;
}

/** A team of snails. */
export interface Team {
  id: string;
  name: string;
  colour: string;
  snails: Snail[];
  researched: string[];
}

/** Wind: `direction` radians about +Y, `strength` in m/s^2 (>= 0). */
export interface Wind {
  strength: number;
  direction: number;
}

/** Plain-data terrain descriptor. Voxel data lives in `SdfGrid`, outside the state. */
export interface TerrainDescriptor {
  nx: number;
  ny: number;
  nz: number;
  cellSize: number;
  waterLevel: number;
}

/** Turn phase. */
export type TurnPhase = 'aiming' | 'firing' | 'resolving' | 'retreat' | 'ended';

/** Current turn info. */
export interface TurnState {
  activeTeamId: string | null;
  activeSnailId: string | null;
  phase: TurnPhase;
  /** Seconds left in the turn. */
  timeRemaining: number;
  turnNumber: number;
}

/** A projectile in flight. */
export interface Projectile {
  id: string;
  position: Vec3;
  velocity: Vec3;
  ownerSnailId: string;
  weaponId: string;
}

/** Match outcome. */
export interface MatchStatus {
  status: 'playing' | 'won' | 'draw';
  winnerTeamId: string | null;
}

/** Top-level game state (plain JSON-serialisable data). */
export interface GameState {
  tick: number;
  seed: number;
  wind: Wind;
  terrain: TerrainDescriptor;
  teams: Team[];
  turn: TurnState;
  projectiles: Projectile[];
  match: MatchStatus;
}

/** Serialisable snapshot of a game state. */
export type GameSnapshot = GameState;
