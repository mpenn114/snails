/** Timer functions used by the heartbeat; injectable for tests. */
export interface HeartbeatTimers {
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

/** Heartbeat configuration. */
export interface HeartbeatOptions {
  /** Ping period in ms. Default 5000. */
  intervalMs?: number;
  /** Terminate a connection with no traffic or pong for this long. Default 15000. */
  timeoutMs?: number;
  timers?: HeartbeatTimers;
  /** Clock in ms. Default `Date.now`. */
  now?: () => number;
}

/** Defaults: ping every 5 s, drop after 15 s of silence. */
export const HEARTBEAT_DEFAULTS = { intervalMs: 5000, timeoutMs: 15_000 } as const;

const realTimers: HeartbeatTimers = {
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (h) => clearInterval(h as ReturnType<typeof setInterval>),
};

/**
 * Liveness watchdog for one socket: calls `ping` every interval and `onTimeout` once when
 * nothing (message or pong) was seen for the timeout. Call {@link Heartbeat.seen} on any traffic.
 */
export class Heartbeat {
  private handle: unknown;
  private lastSeen: number;
  private readonly now: () => number;
  private readonly timers: HeartbeatTimers;
  private readonly timeoutMs: number;

  constructor(
    opts: HeartbeatOptions,
    private readonly ping: () => void,
    private readonly onTimeout: () => void,
  ) {
    this.now = opts.now ?? Date.now;
    this.timers = opts.timers ?? realTimers;
    this.timeoutMs = opts.timeoutMs ?? HEARTBEAT_DEFAULTS.timeoutMs;
    this.lastSeen = this.now();
    this.handle = this.timers.setInterval(
      () => this.tick(),
      opts.intervalMs ?? HEARTBEAT_DEFAULTS.intervalMs,
    );
  }

  /** Records liveness (any inbound message or pong). */
  seen(): void {
    this.lastSeen = this.now();
  }

  /** Stops the timer; safe to call repeatedly. */
  stop(): void {
    if (this.handle === undefined) return;
    this.timers.clearInterval(this.handle);
    this.handle = undefined;
  }

  private tick(): void {
    if (this.now() - this.lastSeen >= this.timeoutMs) {
      this.stop();
      this.onTimeout();
    } else this.ping();
  }
}
