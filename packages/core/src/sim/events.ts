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
  /** Set when the match ended by completing a capstone. */
  reason?: 'research' | 'hill';
}

/** King of the Hill: the zone moved to a new place. */
export interface HillMovedEvent {
  type: 'hillMoved';
  position: Vec3;
  radius: number;
}

/** King of the Hill: a team scored at the end of its turn. */
export interface HillScoredEvent {
  type: 'hillScored';
  teamId: string;
  points: number;
  total: number;
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
export type DamageCause = 'explosion' | 'fall' | 'status' | 'area' | 'crate' | 'suddenDeath';

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

/** A snail launched itself into a jump (`air` for an extra mid-air jump). */
export interface SnailJumpedEvent {
  type: 'snailJumped';
  snailId: string;
  air: boolean;
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

/** A delayed effect was scheduled (clients telegraph its target). */
export interface ScheduledCreatedEvent {
  type: 'scheduledCreated';
  scheduledId: string;
  groupId: string;
  weaponId: string;
  position: Vec3;
  turnsLeft: number;
  radius: number;
  style: 'strike' | 'arrival';
}

/** A scheduled effect ran and was removed. */
export interface ScheduledFiredEvent {
  type: 'scheduledFired';
  scheduledId: string;
  groupId: string;
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

/** A crate appeared in the sky and starts parachuting down. */
export interface CrateSpawnedEvent {
  type: 'crateSpawned';
  crateId: string;
  defId: string;
  position: Vec3;
}

/** A parachuting crate touched down on terrain. */
export interface CrateLandedEvent {
  type: 'crateLanded';
  crateId: string;
  position: Vec3;
}

/** A snail picked a crate up (contents already applied). */
export interface CrateCollectedEvent {
  type: 'crateCollected';
  crateId: string;
  defId: string;
  snailId: string;
  position: Vec3;
  /** Health actually restored. */
  healed: number;
  /** Health lost to a bad mystery outcome (never lethal). */
  damage: number;
  /** Weapon stock added to the snail's team inventory. */
  weapons: { weaponId: string; count: number }[];
  /** Team of the collecting snail. */
  teamId: string;
  /** Short display text for toasts and floating text, e.g. "+25 HP". */
  text: string;
  /** Status applied to the snail, if any. */
  statusId?: string;
}

/** A crate was destroyed. */
export interface CrateDestroyedEvent {
  type: 'crateDestroyed';
  crateId: string;
  position: Vec3;
  reason: 'explosion' | 'water';
}

/** Sudden death began (announce it). `kind` says what will happen each round. */
export interface SuddenDeathStartedEvent {
  type: 'suddenDeathStarted';
  round: number;
  kind: 'water' | 'drain' | 'both';
}

/** Sudden death raised the water; `level` is the new surface height in metres. */
export interface WaterRoseEvent {
  type: 'waterRose';
  level: number;
  delta: number;
}

/** Every event the simulation can emit. Plain JSON data only. */
/** Why a team's Calcium changed. */
export type CalciumReason =
  | 'turnIncome'
  | 'damage'
  | 'kill'
  | 'crate'
  | 'catchUp'
  | 'techIncome'
  | 'mossTax'
  | 'spent'
  | 'refund';

/** A team's Calcium balance changed (private to that team on the wire). */
export interface CalciumChangedEvent {
  type: 'calciumChanged';
  teamId: string;
  delta: number;
  balance: number;
  reason: CalciumReason;
}

/** A tech was added to a team's queue (private). */
export interface ResearchQueuedEvent {
  type: 'researchQueued';
  teamId: string;
  techId: string;
}

/** Work began on a tech; Calcium was paid (private; opponents see only that research is on). */
export interface ResearchStartedEvent {
  type: 'researchStarted';
  teamId: string;
  techId: string;
  turns: number;
  cost: number;
}

/** A queued or active tech was removed (private). */
export interface ResearchCancelledEvent {
  type: 'researchCancelled';
  teamId: string;
  techId: string;
  refund: number;
}

/** A team completed a tech: the public reveal moment. */
export interface ResearchCompletedEvent {
  type: 'researchCompleted';
  teamId: string;
  techId: string;
}

export type SimEvent =
  | TickEvent
  | TurnStartedEvent
  | TurnEndedEvent
  | CalciumChangedEvent
  | ResearchQueuedEvent
  | ResearchStartedEvent
  | ResearchCancelledEvent
  | ResearchCompletedEvent
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
  | SnailJumpedEvent
  | CommandRejectedEvent
  | StatusAppliedEvent
  | StatusExpiredEvent
  | AreaCreatedEvent
  | AreaExpiredEvent
  | AreaMovedEvent
  | SnailMovedEvent
  | RopeAttachedEvent
  | RopeReleasedEvent
  | MeleeStruckEvent
  | ScheduledCreatedEvent
  | ScheduledFiredEvent
  | CrateSpawnedEvent
  | CrateLandedEvent
  | CrateCollectedEvent
  | CrateDestroyedEvent
  | SuddenDeathStartedEvent
  | WaterRoseEvent
  | HillMovedEvent
  | HillScoredEvent;

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
  'snailJumped',
  'commandRejected',
  'statusApplied',
  'statusExpired',
  'areaCreated',
  'areaExpired',
  'areaMoved',
  'scheduledCreated',
  'scheduledFired',
  'snailMoved',
  'ropeAttached',
  'ropeReleased',
  'meleeStruck',
  'crateSpawned',
  'crateLanded',
  'crateCollected',
  'crateDestroyed',
  'suddenDeathStarted',
  'waterRose',
  'hillMoved',
  'hillScored',
  'calciumChanged',
  'researchQueued',
  'researchStarted',
  'researchCancelled',
  'researchCompleted',
];

/** Type guard: is `type` a known simulation event type? */
export function isSimEvent(type: unknown): type is SimEventType {
  return typeof type === 'string' && (SIM_EVENT_TYPES as readonly string[]).includes(type);
}
