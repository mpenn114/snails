import type { MotionSpec } from '../physics/motion.js';

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
  /** Current weapon aim; absent means the default aim. */
  aim?: Aim;
  /** Standing move/jump intent set by move commands; absent means no intent. */
  moveIntent?: MoveIntent;
  /** True while resting on terrain; absent is treated as grounded. */
  grounded?: boolean;
  /** Height at which the current airborne phase began; unset while grounded. */
  airborneFromY?: number;
  /**
   * Set by the movement system on touchdown and consumed by the hazard system in the
   * same step (systems run in order). Unset when there is no unprocessed landing.
   */
  pendingLanding?: PendingLanding;
  /** Active statuses (salt, goo, ...) in application order; absent means none. */
  statuses?: StatusInstance[];
}

/** A status active on a snail (serialisable). Definition lives in the `statuses` registry. */
export interface StatusInstance {
  /** Status definition id, e.g. `base:salt`. */
  id: string;
  /** Remaining ticks; one is spent at the start of each of the snail's team's turns. */
  turnsLeft: number;
  /** Strength multiplier (1 = as defined). */
  magnitude: number;
  /** Snail that applied it, for kill credit. */
  sourceSnailId: string;
}

/** A lingering area (spore cloud, puddle, goo) in the world (serialisable). */
export interface AreaInstance {
  /** Deterministic id `a<counter>`. */
  id: string;
  /** Area definition id, e.g. `base:spore-cloud`. */
  kind: string;
  position: Vec3;
  radius: number;
  /** Remaining turn starts; the area is removed when it reaches 0. */
  turnsLeft: number;
  /** Snail whose weapon created it, for kill credit. */
  sourceSnailId: string;
  /** Free-form numeric parameters for area kinds that need them. */
  params?: Record<string, number>;
}

/** A touchdown waiting to be resolved by the hazard system (serialisable). */
export interface PendingLanding {
  /** Speed at impact in m/s. */
  impactSpeed: number;
  /** Height dropped in metres (>= 0). */
  fallDistance: number;
}

/** Weapon aim of a snail (serialisable). */
export interface Aim {
  /** Elevation in radians above the facing direction, within [-PI/2, PI/2]. */
  angle: number;
  /** Charge in 0..1. */
  power: number;
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
  /** Motion strategy parameters; absent means ballistic. */
  motion?: MotionSpec;
  /** Steering input -1..1 for guided projectiles (set by `steer`); absent = 0. */
  steer?: number;
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
  /** Lingering areas in creation order. */
  areas: AreaInstance[];
  /** Counter used to assign deterministic area ids. */
  nextAreaId: number;
  match: MatchStatus;
}

/** Serialisable snapshot of a game state. */
export type GameSnapshot = GameState;
