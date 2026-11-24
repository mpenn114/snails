import type { RngStreams } from '../rng-streams.js';
import type { SdfGrid } from '../terrain/sdf-grid.js';
import type { GameState } from '../state/types.js';
import type { SimEvent } from './events.js';
import { FIXED_DT } from '../physics/ballistics.js';

export { FIXED_DT };

/** Deterministic RNG streams available to the simulation. */
export type SimRng = RngStreams;

/** Move/jump intent for a snail. */
export interface MoveCommand {
  type: 'move';
  snailId: string;
  direction: -1 | 0 | 1;
  /** Standing turn input -1..1 (see `MoveIntent.turn`); omitted means no turning. */
  turn?: number;
  jump?: boolean;
}

/**
 * Aim intent: angle in radians, power in 0..1. Optional `facing` is a world yaw in radians
 * (same convention as `Snail.facing`) applied to the snail before the shot is computed.
 */
export interface AimCommand {
  type: 'aim';
  snailId: string;
  angle: number;
  power: number;
  facing?: number;
}

/** Fire a weapon. */
export interface FireCommand {
  type: 'fire';
  snailId: string;
  weaponId: string;
}

/** End the given team's turn. */
export interface EndTurnCommand {
  type: 'endTurn';
  teamId: string;
}

/**
 * Steering input (-1..1) for the active snail's guided projectile(s); only effective during
 * their guidance window. Allowed in the `fire` and `resolve` phases.
 */
export interface SteerCommand {
  type: 'steer';
  snailId: string;
  input: number;
}

/** Queue a tech for a team (any phase, any team; validated against tiers and Calcium). */
export interface QueueResearchCommand {
  type: 'queueResearch';
  teamId: string;
  techId: string;
}

/** Remove a queued tech, or cancel the active one (refunds 50% of what was paid). */
export interface CancelResearchCommand {
  type: 'cancelResearch';
  teamId: string;
  techId: string;
}

/** Any player intent fed into the simulation. Validation happens upstream (M1-21). */
export type Command =
  | MoveCommand
  | AimCommand
  | FireCommand
  | EndTurnCommand
  | SteerCommand
  | QueueResearchCommand
  | CancelResearchCommand;

/** Command discriminator values. */
export type CommandType = Command['type'];

/** Everything a handler or system may touch during a step. */
export interface SimContext {
  readonly state: GameState;
  readonly terrain: SdfGrid;
  readonly rng: SimRng;
  readonly dt: number;
  /** Queues an event to be returned from the current step. */
  emit(event: SimEvent): void;
}

/** A system runs once per step, in registration order. */
export type SystemFn = (ctx: SimContext) => void;

/** Handler for one command type. */
export type CommandHandler<T extends CommandType = CommandType> = (
  ctx: SimContext,
  cmd: Extract<Command, { type: T }>,
) => void;
