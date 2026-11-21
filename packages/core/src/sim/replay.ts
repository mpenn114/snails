import type { Simulation } from './simulation.js';
import type { Command } from './types.js';
import type { SimEvent } from './events.js';
import { createMatch, type MatchOptions } from './match.js';
import type { ValidationResult } from './validation.js';

/** One recorded command and the tick of the step that drains it. */
export interface ReplayCommand {
  tick: number;
  command: Command;
  /** Issuer passed to `submit`. */
  issuerTeamId?: string;
  /** True if the command was queued with `enqueue` (unvalidated) instead of `submit`. */
  raw?: boolean;
}

/** Plain-JSON record of a whole match. */
export interface Replay {
  version: 1;
  matchOptions: MatchOptions;
  commands: ReplayCommand[];
  finalTick: number;
  finalChecksum: string;
}

/** Result of {@link playReplay}. */
export interface ReplayResult {
  sim: Simulation;
  events: SimEvent[];
  /** True if the replayed final checksum equals the recorded one. */
  matches: boolean;
  expectedChecksum: string;
  actualChecksum: string;
}

function fnv(h: number, bytes: ArrayLike<number>): number {
  let x = h;
  for (let i = 0; i < bytes.length; i++) x = Math.imul(x ^ (bytes[i] as number), 0x01000193) >>> 0;
  return x;
}

/** Stable FNV-1a hash (hex) of the snapshot JSON plus the terrain grid bytes. */
export function stateChecksum(sim: Simulation): string {
  const json = JSON.stringify(sim.snapshot());
  const chars: number[] = [];
  for (let i = 0; i < json.length; i++) {
    chars.push(json.charCodeAt(i) & 0xff, json.charCodeAt(i) >> 8);
  }
  let h = fnv(0x811c9dc5, chars);
  const d = sim.terrain.data;
  h = fnv(h, new Uint8Array(d.buffer, d.byteOffset, d.byteLength));
  return h.toString(16).padStart(8, '0');
}

/** Records accepted commands of a simulation by hooking its `submit` and `enqueue`. */
export class ReplayRecorder {
  private readonly commands: ReplayCommand[] = [];

  /** Starts recording `sim`, which must have been built from `matchOptions`. */
  constructor(
    private readonly matchOptions: MatchOptions,
    sim: Simulation,
  ) {
    const submit = sim.submit.bind(sim);
    const enqueue = sim.enqueue.bind(sim);
    sim.submit = (cmd: Command, issuer?: string): ValidationResult => {
      const result = submit(cmd, issuer);
      if (result.ok) {
        const rec: ReplayCommand = { tick: sim.state.tick, command: cmd };
        if (issuer !== undefined) rec.issuerTeamId = issuer;
        this.commands.push(rec);
      }
      return result;
    };
    sim.enqueue = (cmd: Command): void => {
      enqueue(cmd);
      this.commands.push({ tick: sim.state.tick, command: cmd, raw: true });
    };
  }

  /** Produces the replay, checksumming the current (final) state of `sim`. */
  finish(sim: Simulation): Replay {
    const options = JSON.parse(JSON.stringify(this.matchOptions)) as MatchOptions;
    const commands = JSON.parse(JSON.stringify(this.commands)) as ReplayCommand[];
    return {
      version: 1,
      matchOptions: options,
      commands,
      finalTick: sim.state.tick,
      finalChecksum: stateChecksum(sim),
    };
  }
}

/** Rebuilds the match and re-runs a replay, comparing the final checksum. */
export function playReplay(replay: Replay): ReplayResult {
  const { sim } = createMatch(replay.matchOptions);
  const events: SimEvent[] = [];
  let next = 0;
  while (sim.state.tick < replay.finalTick) {
    for (
      let c = replay.commands[next];
      c && c.tick <= sim.state.tick;
      c = replay.commands[++next]
    ) {
      if (c.raw) sim.enqueue(c.command);
      else sim.submit(c.command, c.issuerTeamId);
    }
    events.push(...sim.step());
  }
  const actualChecksum = stateChecksum(sim);
  return {
    sim,
    events,
    matches: actualChecksum === replay.finalChecksum,
    expectedChecksum: replay.finalChecksum,
    actualChecksum,
  };
}
