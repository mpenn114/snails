import type { GameState } from '../state/types.js';
import type { SdfGrid } from '../terrain/sdf-grid.js';
import {
  type Command,
  type CommandHandler,
  type CommandType,
  type SimContext,
  type SimEvent,
  type SimRng,
  type SystemFn,
} from './types.js';
import { FIXED_DT } from '../physics/ballistics.js';

/** Constructor options for {@link Simulation}. */
export interface SimulationOptions {
  state: GameState;
  terrain: SdfGrid;
  rng: SimRng;
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
  private readonly queue: Command[] = [];
  private readonly handlers = new Map<CommandType, CommandHandler<never>>();
  private readonly systems: { name: string; fn: SystemFn }[] = [];

  constructor(options: SimulationOptions) {
    this.state = options.state;
    this.terrain = options.terrain;
    this.rng = options.rng;
  }

  /** Queues a command for the next step (FIFO). */
  enqueue(cmd: Command): void {
    this.queue.push(cmd);
  }

  /** Registers (or replaces) the handler for a command type. */
  registerCommandHandler<T extends CommandType>(type: T, fn: CommandHandler<T>): void {
    this.handlers.set(type, fn as unknown as CommandHandler<never>);
  }

  /** Appends a named system; systems run in insertion order each step. */
  addSystem(name: string, fn: SystemFn): void {
    this.systems.push({ name, fn });
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
    for (const cmd of this.queue.splice(0)) {
      const handler = this.handlers.get(cmd.type) as CommandHandler | undefined;
      handler?.(ctx, cmd as never);
    }
    for (const sys of this.systems) sys.fn(ctx);
    this.state.tick += 1;
    events.push({ type: 'tick', tick: this.state.tick });
    return events;
  }

  /** Deep, plain-data copy of the current state. */
  snapshot(): GameState {
    return JSON.parse(JSON.stringify(this.state)) as GameState;
  }
}
