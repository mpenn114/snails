import type { FrameScheduler } from './render-loop.js';

/** Options of {@link createCappedScheduler}. */
export interface CappedSchedulerOptions {
  /** Underlying scheduler (requestAnimationFrame). */
  base: FrameScheduler;
  /** Clock in milliseconds. */
  now: () => number;
  /** Current fps cap; 0 or less means uncapped. Read at every frame, so it may change live. */
  getMaxFps: () => number;
}

/** Slack so a 30 fps cap on a 60 Hz display (16.67 ms ticks) is not skipped by jitter. */
const JITTER_MS = 1.5;

/** Whether a frame at `nowMs` may run given the last run time and an fps cap. */
export function shouldRunFrame(nowMs: number, lastRunMs: number, maxFps: number): boolean {
  if (maxFps <= 0) return true;
  return nowMs - lastRunMs >= 1000 / maxFps - JITTER_MS;
}

/**
 * Wraps a scheduler so callbacks run at most `getMaxFps()` times per second by skipping
 * display ticks. Cancelling a returned handle works across skipped ticks.
 */
export function createCappedScheduler(opts: CappedSchedulerOptions): FrameScheduler {
  let nextId = 1;
  let last = -Infinity;
  const pending = new Map<number, number>();
  return {
    request(cb) {
      const id = nextId++;
      const tick = (t: number): void => {
        const now = opts.now();
        if (!shouldRunFrame(now, last, opts.getMaxFps())) {
          pending.set(id, opts.base.request(tick));
          return;
        }
        pending.delete(id);
        last = now;
        cb(t);
      };
      pending.set(id, opts.base.request(tick));
      return id;
    },
    cancel(id) {
      const h = pending.get(id);
      if (h === undefined) return;
      pending.delete(id);
      opts.base.cancel(h);
    },
  };
}
