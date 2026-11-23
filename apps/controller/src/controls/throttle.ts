/** Injectable time source for the throttle. */
export interface ThrottleDeps {
  now: () => number;
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (h: unknown) => void;
}

/** A latest-wins throttled sender. */
export interface Throttled<T> {
  /** Offers a value: sent now if the interval elapsed, else the latest is sent on the trailing edge. */
  push(v: T): void;
  /** Cancels any pending trailing send. */
  cancel(): void;
}

/** Creates a latest-wins throttle with a trailing send, at most one send per `intervalMs`. */
export function createThrottle<T>(
  send: (v: T) => void,
  intervalMs: number,
  deps: ThrottleDeps,
): Throttled<T> {
  let lastSent = -Infinity;
  let pending: { v: T } | null = null;
  let timer: unknown = null;

  const flush = (): void => {
    timer = null;
    if (!pending) return;
    const { v } = pending;
    pending = null;
    lastSent = deps.now();
    send(v);
  };

  return {
    push(v) {
      const wait = lastSent + intervalMs - deps.now();
      if (wait <= 0 && timer === null) {
        lastSent = deps.now();
        send(v);
        return;
      }
      pending = { v };
      if (timer === null) timer = deps.setTimeout(flush, Math.max(0, wait));
    },
    cancel() {
      if (timer !== null) deps.clearTimeout(timer);
      timer = null;
      pending = null;
    },
  };
}
