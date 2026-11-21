import type { RngStreams } from '../rng-streams.js';
import type { SdfGrid } from '../terrain/sdf-grid.js';
import type { GameState } from '../state/types.js';
import { FIXED_DT } from '../physics/ballistics.js';

export { FIXED_DT };

/** Deterministic RNG streams available to the simulation. */
export type SimRng = RngStreams;

/** Move/jump intent for a snail. */
export interface MoveCommand {
  type: 'move';
  snailId: string;
  direction: -1 | 0 | 1;
  jump?: boolean;
}

/** Aim intent: angle in radians, power in 0..1. */
export interface AimCommand {
  type: 'aim';
  snailId: string;
  angle: number;
  power: number;
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

/** Any player intent fed into the simulation. Validation happens upstream (M1-21). */
export type Command = MoveCommand | AimCommand | FireCommand | EndTurnCommand;

/** Command discriminator values. */
export type CommandType = Command['type'];

/** Plain-data event emitted by the simulation. */
export type SimEvent = { type: 'tick'; tick: number } | { type: string; [key: string]: unknown };

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
