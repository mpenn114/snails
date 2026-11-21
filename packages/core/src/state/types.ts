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
  /** Standing move/jump intent set by move commands; absent means no intent. */
  moveIntent?: MoveIntent;
  /** True while resting on terrain; absent is treated as grounded. */
  grounded?: boolean;
  /** Height at which the current airborne phase began; unset while grounded. */
  airborneFromY?: number;
}

/** Persistent movement intent of a snail (serialisable). */
export interface MoveIntent {
  /** Walk along (+1) or against (-1) the facing direction; 0 stands still. */
  direction: -1 | 0 | 1;
  /** A jump is pending and will be consumed by the movement system. */
  jumpRequested: boolean;
}

/** A team of snails. */
export interface Team {
  id: string;
  name: string;
  colour: string;
  snails: Snail[];
  researched: string[];
  /**
   * Round-robin cursor: index into `snails` of the next snail to be offered a turn.
   * Advanced by `selectNextActive`; dead snails are skipped at selection time.
   */
  nextSnailIndex: number;
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
export type TurnPhase = 'intro' | 'action' | 'fire' | 'resolve' | 'retreat' | 'settle';

/** Current turn info. */
export interface TurnState {
  activeTeamId: string | null;
  activeSnailId: string | null;
  phase: TurnPhase;
  /** Seconds left in the turn. */
  timeRemaining: number;
  turnNumber: number;
  /** Seconds elapsed in the current phase. */
  phaseTime: number;
  /** True once a shot was fired this turn. */
  fired: boolean;
}

/** A projectile in flight. */
export interface Projectile {
  id: string;
  position: Vec3;
  velocity: Vec3;
  ownerSnailId: string;
  weaponId: string;
  /** Collision sphere radius in metres. */
  radius: number;
  /** Seconds since spawn. */
  age: number;
  /** Lifetime/fuse in seconds; the projectile expires at this age. */
  maxAge: number;
  /** Gravity multiplier, 0..1. */
  gravityScale: number;
  /** Wind multiplier, 0..1. */
  windScale: number;
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
  /** Counter used to assign deterministic projectile ids. */
  nextProjectileId: number;
  match: MatchStatus;
}

/** Serialisable snapshot of a game state. */
export type GameSnapshot = GameState;
