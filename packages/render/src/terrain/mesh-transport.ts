/** Transports carrying mesh requests to a worker (or in-process fallback). */
import { handleMeshRequest, type MeshRequest, type MeshResponse } from './mesh-protocol.js';

/** Abstract channel to a mesher. Responses may arrive in any order. */
export interface MeshTransport {
  /** Sends a request, transferring the listed buffers. */
  post(msg: MeshRequest, transfer: ArrayBuffer[]): void;
  /** Registers the (single) response callback. */
  onMessage(cb: (res: MeshResponse) => void): void;
  /** Releases the underlying worker(s). */
  terminate(): void;
}

/** Minimal Worker surface used by the transport (matches the DOM Worker). */
export interface WorkerLike {
  postMessage(msg: unknown, transfer: ArrayBuffer[]): void;
  onmessage: ((ev: { data: MeshResponse }) => void) | null;
  terminate(): void;
}

/** Wraps one worker as a transport. */
export function createWorkerTransport(worker: WorkerLike): MeshTransport {
  return {
    post: (msg, transfer) => worker.postMessage(msg, transfer),
    onMessage: (cb) => {
      worker.onmessage = (ev) => cb(ev.data);
    },
    terminate: () => worker.terminate(),
  };
}

/** Spawns the real module Web Worker (Vite-compatible). Browser only. */
export function spawnMeshWorker(): WorkerLike {
  return new Worker(new URL('./mesh-worker.js', import.meta.url), {
    type: 'module',
  }) as unknown as WorkerLike;
}

/** Round-robin pool over several transports. */
export function createPoolTransport(transports: readonly MeshTransport[]): MeshTransport {
  if (transports.length === 0) throw new RangeError('pool needs at least one transport');
  let next = 0;
  return {
    post: (msg, transfer) => {
      transports[next]?.post(msg, transfer);
      next = (next + 1) % transports.length;
    },
    onMessage: (cb) => transports.forEach((t) => t.onMessage(cb)),
    terminate: () => transports.forEach((t) => t.terminate()),
  };
}

/** Pool of `size` real Web Workers (default 2). Browser only. */
export function createWorkerPool(size = 2): MeshTransport {
  const ts = Array.from({ length: Math.max(1, size) }, () =>
    createWorkerTransport(spawnMeshWorker()),
  );
  return createPoolTransport(ts);
}

/** In-process transport options. */
export interface InProcessOptions {
  /** Deliver synchronously instead of on a microtask (default false). */
  readonly sync?: boolean;
  /** Observes each posted request's transfer list (for tests/diagnostics). */
  readonly onPost?: (msg: MeshRequest, transfer: ArrayBuffer[]) => void;
}

/** Fallback running the mesher on the calling thread (Node tests, no-Worker hosts). */
export function createInProcessTransport(opts: InProcessOptions = {}): MeshTransport {
  let cb: ((res: MeshResponse) => void) | null = null;
  let closed = false;
  const deliver = (msg: MeshRequest): void => {
    if (!closed) cb?.(handleMeshRequest(msg));
  };
  return {
    post: (msg, transfer) => {
      opts.onPost?.(msg, transfer);
      if (opts.sync) deliver(msg);
      else queueMicrotask(() => deliver(msg));
    },
    onMessage: (c) => {
      cb = c;
    },
    terminate: () => {
      closed = true;
    },
  };
}
