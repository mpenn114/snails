import type { GameSnapshot, GameState } from '../state/types.js';
import { createSnapshot } from '../state/game-state.js';
import type { SdfGrid } from '../terrain/sdf-grid.js';
import {
  type Command,
  type CommandHandler,
  type CommandType,
  type SimContext,
  type SimRng,
  type SystemFn,
} from './types.js';
import type { SimEvent } from './events.js';
import { FIXED_DT } from '../physics/ballistics.js';
import type { TurnStartHook } from '../turn/turn-hooks.js';
import { requestEndTurn } from '../turn/turn-phases.js';
import { validateCommand, type ValidationResult } from './validation.js';

interface QueuedCommand {
  cmd: Command;
  /** Present only for commands that went through {@link Simulation.submit}. */
  validate?: { issuerTeamId?: string };
}

/** Constructor options for {@link Simulation}. */
export interface SimulationOptions {
  state: GameState;
  terrain: SdfGrid;
  rng: SimRng;
  /** Weapon registry used to validate `fire` commands (optional). */
  weapons?: { has(id: string): boolean };
}

/** Error thrown on misuse of the driver (not on gameplay conditions). */
export class SimulationError extends Error {
  constructor(
    readonly code: 'INVALID_DT',
    message: string,
  ) {
    super(message);
    this.name = 'SimulationError';
  }
}

/**
 * Fixed-timestep simulation driver. Never reads a wall clock: the caller decides how many
 * steps to run. Only `dt === FIXED_DT` is accepted; callers accumulate real time themselves.
 */
export class Simulation {
  readonly state: GameState;
  readonly terrain: SdfGrid;
  readonly rng: SimRng;
  private readonly queue: QueuedCommand[] = [];
  private readonly weapons?: { has(id: string): boolean };
  private readonly handlers = new Map<CommandType, CommandHandler<never>>();
  private readonly systems: { name: string; fn: SystemFn }[] = [];
  private readonly turnStartHooks: { name: string; fn: TurnStartHook }[] = [];

  constructor(options: SimulationOptions) {
    this.state = options.state;
    this.terrain = options.terrain;
    this.rng = options.rng;
    this.weapons = options.weapons;
    this.registerCommandHandler('endTurn', (c) => requestEndTurn(c.state, c.emit));
  }

  /** Queues a command for the next step (FIFO). */
  enqueue(cmd: Command): void {
    this.queue.push({ cmd });
  }

  /**
   * Validates a command and queues it if accepted. It is validated again when drained.
   * @param issuer team issuing the command, if known.
   */
  submit(cmd: Command, issuer?: string): ValidationResult {
    const result = this.validate(cmd, issuer);
    if (result.ok) this.queue.push({ cmd, validate: { issuerTeamId: issuer } });
    return result;
  }

  private validate(cmd: Command, issuerTeamId?: string): ValidationResult {
    return validateCommand(this.state, cmd, { weapons: this.weapons, issuerTeamId });
  }

  /** Registers (or replaces) the handler for a command type. */
  registerCommandHandler<T extends CommandType>(type: T, fn: CommandHandler<T>): void {
    this.handlers.set(type, fn as unknown as CommandHandler<never>);
  }

  /** Appends a named system; systems run in insertion order each step. */
  addSystem(name: string, fn: SystemFn): void {
    this.systems.push({ name, fn });
  }

  /**
   * Registers a turn-start hook. Hooks run in registration order in the step where
   * `state.turn.turnNumber` changes, after all systems (so after `turnStarted`). The first
   * turn begins before the simulation exists and does not trigger hooks.
   */
  registerTurnStartHook(name: string, fn: TurnStartHook): void {
    this.turnStartHooks.push({ name, fn });
  }

  /** Names of registered turn-start hooks in execution order. */
  turnStartHookNames(): string[] {
    return this.turnStartHooks.map((h) => h.name);
  }

  /** Names of registered systems in execution order. */
  systemNames(): string[] {
    return this.systems.map((s) => s.name);
  }

  /**
   * Advances one fixed step: drains commands, runs systems, increments `state.tick`.
   * @returns events emitted during the step, ending with a `tick` event.
   * @throws SimulationError with code `INVALID_DT` if `dt !== FIXED_DT`.
   */
  step(dt: number = FIXED_DT): SimEvent[] {
    if (dt !== FIXED_DT) {
      throw new SimulationError('INVALID_DT', `dt must equal FIXED_DT (${FIXED_DT}), got ${dt}`);
    }
    const events: SimEvent[] = [];
    const ctx: SimContext = {
      state: this.state,
      terrain: this.terrain,
      rng: this.rng,
      dt,
      emit: (e) => events.push(e),
    };
    for (const { cmd, validate } of this.queue.splice(0)) {
      if (validate) {
        const result = this.validate(cmd, validate.issuerTeamId);
        if (!result.ok) {
          ctx.emit({ type: 'commandRejected', command: cmd.type, reason: result.reason });
          continue;
        }
      }
      const handler = this.handlers.get(cmd.type) as CommandHandler | undefined;
      handler?.(ctx, cmd as never);
    }
    const turnBefore = this.state.turn.turnNumber;
    for (const sys of this.systems) sys.fn(ctx);
    if (this.state.turn.turnNumber !== turnBefore) {
      const info = {
        teamId: this.state.turn.activeTeamId,
        snailId: this.state.turn.activeSnailId,
        turnNumber: this.state.turn.turnNumber,
      };
      for (const hook of this.turnStartHooks) hook.fn(ctx, info);
    }
    this.state.tick += 1;
    events.push({ type: 'tick', tick: this.state.tick });
    return events;
  }

  /** Deep, plain-data copy of the current state. */
  snapshot(): GameSnapshot {
    return createSnapshot(this.state);
  }
}
