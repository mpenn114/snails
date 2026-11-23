import { Histogram } from '@snails/protocol';
import type { HistogramSummary } from '@snails/protocol';

/** JSON shape of one room's latency stats (`/api/debug/latency`). */
export interface RoomLatencyReport {
  roomCode: string;
  /** Intents applied (with or without `seq`). */
  intents: number;
  /** Receive to applied, ms (handler time). */
  receiveToApplied: HistogramSummary;
  /** Applied to the first snapshot with a later tick being sent, ms. */
  appliedToBroadcast: HistogramSummary;
  /** Receive to that snapshot being sent, ms. */
  receiveToBroadcast: HistogramSummary;
}

/** Options for {@link LatencyRegistry}. */
export interface LatencyRegistryOptions {
  /** Monotonic-ish clock in ms. Default `performance.now`. */
  now?: () => number;
  /** Summary logger used at match end. Default `console.info`. */
  log?: (line: string) => void;
}

const MAX_PENDING = 256;

interface Pending {
  receivedAt: number;
  appliedAt: number;
  tick: number;
}

class RoomStats {
  intents = 0;
  readonly r2a = new Histogram();
  readonly a2b = new Histogram();
  readonly r2b = new Histogram();
  pending: Pending[] = [];
}

/** Server-side command latency: receive to applied to broadcast, per room. */
export class LatencyRegistry {
  private readonly rooms = new Map<string, RoomStats>();
  private readonly now: () => number;
  private readonly log: (line: string) => void;

  constructor(opts: LatencyRegistryOptions = {}) {
    this.now = opts.now ?? ((): number => performance.now());
    this.log = opts.log ?? ((l): void => console.info(l));
  }

  /** Current time from the injected clock. */
  time(): number {
    return this.now();
  }

  private stats(room: string): RoomStats {
    let s = this.rooms.get(room);
    if (!s) this.rooms.set(room, (s = new RoomStats()));
    return s;
  }

  /** Records an intent received at `receivedAt` and applied now at simulation `tick`. */
  intentApplied(room: string, receivedAt: number, tick: number): void {
    const s = this.stats(room);
    const appliedAt = this.now();
    s.intents++;
    s.r2a.record(appliedAt - receivedAt);
    s.pending.push({ receivedAt, appliedAt, tick });
    if (s.pending.length > MAX_PENDING) s.pending.shift();
  }

  /** Notes that a snapshot with `tick` was sent in `room`; resolves pending intents applied earlier. */
  snapshotSent(room: string, tick: number): void {
    const s = this.rooms.get(room);
    if (!s || s.pending.length === 0) return;
    const t = this.now();
    s.pending = s.pending.filter((p) => {
      if (tick <= p.tick) return true;
      s.a2b.record(t - p.appliedAt);
      s.r2b.record(t - p.receivedAt);
      return false;
    });
  }

  /** Stats for one room, or undefined if it never saw an intent. */
  report(room: string): RoomLatencyReport | undefined {
    const s = this.rooms.get(room);
    if (!s) return undefined;
    return {
      roomCode: room,
      intents: s.intents,
      receiveToApplied: s.r2a.summary(),
      appliedToBroadcast: s.a2b.summary(),
      receiveToBroadcast: s.r2b.summary(),
    };
  }

  /** Stats for every room. */
  reportAll(): RoomLatencyReport[] {
    return [...this.rooms.keys()].flatMap((c) => this.report(c) ?? []);
  }

  /** Logs a one-line summary for the room and clears its stats (call at match end). */
  matchEnded(room: string): void {
    const r = this.report(room);
    this.rooms.delete(room);
    if (!r || r.intents === 0) return;
    const f = (h: HistogramSummary): string => `p50=${h.p50} p90=${h.p90} p99=${h.p99}`;
    this.log(
      `[latency] room=${room} intents=${r.intents} recv->applied ${f(r.receiveToApplied)} ` +
        `applied->broadcast ${f(r.appliedToBroadcast)} recv->broadcast ${f(r.receiveToBroadcast)} (ms)`,
    );
  }
}
