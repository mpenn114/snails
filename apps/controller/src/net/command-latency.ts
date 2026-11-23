import { Histogram, RateMeter } from '@snails/protocol';
import type { HistogramSummary } from '@snails/protocol';

const MAX_PENDING = 64;

interface Entry {
  sentAt: number;
  serverTick: number | undefined;
}

/**
 * Measures command-to-effect latency on the client: from sending a seq-stamped intent to the first
 * snapshot whose tick is later than the tick the server reported in its `ack`. Also meters the
 * snapshot rate. Pure; time is passed in.
 */
export class CommandLatency {
  private readonly pending = new Map<number, Entry>();
  private readonly hist = new Histogram();
  private readonly snaps = new RateMeter();

  /** Notes that intent `seq` went on the wire at `now` (ms). */
  sent(seq: number, now: number): void {
    this.pending.set(seq, { sentAt: now, serverTick: undefined });
    if (this.pending.size > MAX_PENDING) {
      const oldest = this.pending.keys().next().value;
      if (oldest !== undefined) this.pending.delete(oldest);
    }
  }

  /** Handles `ack`: the server applied `seq` at `serverTick`. */
  acked(seq: number, serverTick: number): void {
    const e = this.pending.get(seq);
    if (e) e.serverTick = serverTick;
  }

  /** Handles a snapshot arriving at `now`: resolves every acked intent it reflects. */
  snapshot(tick: number, now: number): void {
    this.snaps.mark(now);
    for (const [seq, e] of this.pending) {
      if (e.serverTick === undefined || tick <= e.serverTick) continue;
      this.hist.record(now - e.sentAt);
      this.pending.delete(seq);
    }
  }

  /** Send to first-reflecting-snapshot latency summary (ms). */
  summary(): HistogramSummary {
    return this.hist.summary();
  }

  /** Snapshots per second over the last couple of seconds. */
  snapshotRate(now: number): number {
    return this.snaps.rate(now);
  }
}
