import type { MatchStatus, TurnPhase, Vec3 } from '../state/types.js';
import type { ChunkId } from '../terrain/sdf-grid.js';
import type { FallenCluster } from '../terrain/collapse.js';
import type { RejectionReason } from './validation.js';
import type { CommandType } from './types.js';

/** End of every step; `tick` is the new tick count. */
export interface TickEvent {
  type: 'tick';
  tick: number;
}

/** A turn began for the given team/snail. */
export interface TurnStartedEvent {
  type: 'turnStarted';
  /** Null only when no team/snail is active (mirrors `state.turn`). */
  teamId: string | null;
  snailId: string | null;
  turnNumber: number;
}

/** The active turn ended. */
export interface TurnEndedEvent {
  type: 'turnEnded';
  teamId: string | null;
  turnNumber: number;
}

/** The turn phase machine moved from `from` to `to`. */
export interface PhaseChangedEvent {
  type: 'phaseChanged';
  from: TurnPhase;
  to: TurnPhase;
}

/** Wind was re-rolled (strength m/s^2, direction radians about +Y). */
export interface WindChangedEvent {
  type: 'windChanged';
  strength: number;
  direction: number;
}

/** The match is over. `winnerTeamId` is absent for draws. */
export interface MatchEndedEvent {
  type: 'matchEnded';
  status: MatchStatus['status'];
  winnerTeamId?: string;
}

/** A weapon launched a projectile. */
export interface ProjectileFiredEvent {
  type: 'projectileFired';
  projectileId: string;
  weaponId: string;
  snailId: string;
  position: Vec3;
  velocity: Vec3;
}

/** A projectile touched terrain or a snail. `snailId` is set when a snail was hit. */
export interface ProjectileHitEvent {
  type: 'projectileHit';
  projectileId: string;
  position: Vec3;
  normal: Vec3;
  weaponId: string;
  ownerSnailId: string;
  snailId?: string;
}

/** A projectile ended without contact (fuse ran out or left the world). */
export interface ProjectileExpiredEvent {
  type: 'projectileExpired';
  projectileId: string;
  position: Vec3;
  reason: 'fuse' | 'bounds';
}

/** An explosion went off. */
export interface ExplosionEvent {
  type: 'explosion';
  position: Vec3;
  radius: number;
  weaponId: string;
}

/** Terrain was carved; `chunks` lists the changed chunk ids (sorted, unique). */
export interface TerrainCarvedEvent {
  type: 'terrainCarved';
  centre: Vec3;
  radius: number;
  /** Damage power of the carve (for indestructible materials); omitted = unlimited. */
  power?: number;
  chunks: ChunkId[];
}

/** Floating terrain fell away after a carve. */
export interface TerrainCollapsedEvent {
  type: 'terrainCollapsed';
  chunks: ChunkId[];
  removedCells: number;
  /** Clusters that dropped and landed (renderer can animate from this). */
  fallen: FallenCluster[];
  /** Ascending grid sample indices written by the collapse (moved and removed cells). */
  cellIndices: number[];
  /** Final sample value per `cellIndices` entry; lets a replica reproduce the grid exactly. */
  cellValues: number[];
}

/** Why a snail took damage. */
export type DamageCause = 'explosion' | 'fall' | 'status' | 'area';

/** A snail lost health. `sourceSnailId` is null for environmental damage. */
export interface SnailDamagedEvent {
  type: 'snailDamaged';
  snailId: string;
  amount: number;
  remaining: number;
  sourceSnailId: string | null;
  cause: DamageCause;
}

/** Why a snail died. */
export type DeathCause = 'explosion' | 'fall' | 'drown' | 'void' | 'status' | 'area';

/** A snail died. */
export interface SnailDiedEvent {
  type: 'snailDied';
  snailId: string;
  teamId: string;
  cause: DeathCause;
}

/** A snail fell below the waterline (always followed by `snailDied`). */
export interface SnailDrownedEvent {
  type: 'snailDrowned';
  snailId: string;
}

/** A snail touched down after being airborne. */
export interface SnailLandedEvent {
  type: 'snailLanded';
  snailId: string;
  impactSpeed: number;
  fallDistance: number;
}

/** A command failed validation. */
export interface CommandRejectedEvent {
  type: 'commandRejected';
  command: CommandType;
  reason: RejectionReason;
}

/** A status was applied to (or refreshed on) a snail. */
export interface StatusAppliedEvent {
  type: 'statusApplied';
  snailId: string;
  statusId: string;
  turnsLeft: number;
  magnitude: number;
  sourceSnailId: string;
}

/** A status ran out (or its snail died) and was removed. */
export interface StatusExpiredEvent {
  type: 'statusExpired';
  snailId: string;
  statusId: string;
}

/** An area was created. */
export interface AreaCreatedEvent {
  type: 'areaCreated';
  areaId: string;
  kind: string;
  position: Vec3;
  radius: number;
  turnsLeft: number;
}

/** An area ran out and was removed. */
export interface AreaExpiredEvent {
  type: 'areaExpired';
  areaId: string;
  kind: string;
}

/** An area drifted with the wind to a new position. */
export interface AreaMovedEvent {
  type: 'areaMoved';
  areaId: string;
  position: Vec3;
}

/** A snail was repositioned by a `move` effect. */
export interface SnailMovedEvent {
  type: 'snailMoved';
  snailId: string;
  from: Vec3;
  to: Vec3;
}

/** A snail's slime strand stuck to terrain and the snail starts being reeled in. */
export interface RopeAttachedEvent {
  type: 'ropeAttached';
  snailId: string;
  anchor: Vec3;
  seconds: number;
}

/** The reel ended (arrived, blocked or the snail died); the strand is gone. */
export interface RopeReleasedEvent {
  type: 'ropeReleased';
  snailId: string;
}

/** A melee weapon struck at `position` (a point just in front of the attacker). */
export interface MeleeStruckEvent {
  type: 'meleeStruck';
  snailId: string;
  weaponId: string;
  position: Vec3;
}

/** Every event the simulation can emit. Plain JSON data only. */
export type SimEvent =
  | TickEvent
  | TurnStartedEvent
  | TurnEndedEvent
  | PhaseChangedEvent
  | WindChangedEvent
  | MatchEndedEvent
  | ProjectileFiredEvent
  | ProjectileHitEvent
  | ProjectileExpiredEvent
  | ExplosionEvent
  | TerrainCarvedEvent
  | TerrainCollapsedEvent
  | SnailDamagedEvent
  | SnailDiedEvent
  | SnailDrownedEvent
  | SnailLandedEvent
  | CommandRejectedEvent
  | StatusAppliedEvent
  | StatusExpiredEvent
  | AreaCreatedEvent
  | AreaExpiredEvent
  | AreaMovedEvent
  | SnailMovedEvent
  | RopeAttachedEvent
  | RopeReleasedEvent
  | MeleeStruckEvent;

/** Discriminator values of {@link SimEvent}. */
export type SimEventType = SimEvent['type'];

/** The event interface for discriminator `T`. */
export type SimEventOf<T extends SimEventType> = Extract<SimEvent, { type: T }>;

/** All event types, in declaration order. */
export const SIM_EVENT_TYPES: readonly SimEventType[] = [
  'tick',
  'turnStarted',
  'turnEnded',
  'phaseChanged',
  'windChanged',
  'matchEnded',
  'projectileFired',
  'projectileHit',
  'projectileExpired',
  'explosion',
  'terrainCarved',
  'terrainCollapsed',
  'snailDamaged',
  'snailDied',
  'snailDrowned',
  'snailLanded',
  'commandRejected',
  'statusApplied',
  'statusExpired',
  'areaCreated',
  'areaExpired',
  'areaMoved',
  'snailMoved',
  'ropeAttached',
  'ropeReleased',
  'meleeStruck',
];

/** Type guard: is `type` a known simulation event type? */
export function isSimEvent(type: unknown): type is SimEventType {
  return typeof type === 'string' && (SIM_EVENT_TYPES as readonly string[]).includes(type);
}
