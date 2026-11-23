import type * as THREE from 'three';
import type { GameSnapshot } from '@snails/core';
import type { FrameRenderer } from './post/post-pipeline.js';

/** What the loop reads each frame: the latest sim snapshot and interpolation alpha. */
export interface RenderState {
  snapshot: GameSnapshot;
  /** Fraction (0..1) between previous and current sim tick. */
  alpha: number;
}

/** Injectable source of render state. */
export interface RenderStateSource {
  /** Latest state, or null if nothing is available yet. */
  getState(): RenderState | null;
}

/** Per-frame system. `dt` is seconds since the previous frame. */
export type FrameUpdater = (dt: number, state: RenderState | null) => void;

/** Minimal renderer surface (WebGLRenderer satisfies it). */
export interface RendererLike {
  render(scene: THREE.Scene, camera: THREE.Camera): void;
  setSize(width: number, height: number, updateStyle?: boolean): void;
  setPixelRatio(ratio: number): void;
  dispose(): void;
}

/** Frame scheduler (requestAnimationFrame-like). Returns a cancel handle. */
export interface FrameScheduler {
  request(cb: (timeMs: number) => void): number;
  cancel(handle: number): void;
}

/** Dependencies of a render loop. */
export interface RenderLoopDeps {
  renderer: RendererLike;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  scheduler: FrameScheduler;
  /** Clock in milliseconds. */
  now: () => number;
  pixelRatio: number;
  source?: RenderStateSource;
}

/** Main-thread time split of the last frames (ms); render = JS cost of `renderer.render`. */
export interface LoopTimings {
  /** Last frame's updater time. */
  updateMs: number;
  /** Last frame's render-call time (CPU side only; GPU work is asynchronous). */
  renderMs: number;
  /** Exponential moving average of `updateMs`. */
  avgUpdateMs: number;
  /** Exponential moving average of `renderMs`. */
  avgRenderMs: number;
}

/** Controllable frame loop. */
export interface RenderLoop {
  /** Per-frame CPU timings, for profiling overlays. */
  readonly timings: Readonly<LoopTimings>;
  /** Registers a per-frame updater; returns an unregister function. */
  addUpdater(fn: FrameUpdater): () => void;
  /** Replaces the state source. */
  setSource(source: RenderStateSource | null): void;
  /**
   * Routes frames through a post-processing chain instead of `renderer.render` (null restores
   * direct rendering). The loop disposes the chain on `dispose` and when it is replaced.
   */
  setPost(post: FrameRenderer | null): void;
  /** Starts pulling frames (no-op if running or disposed). */
  start(): void;
  /** Halts frame scheduling. */
  stop(): void;
  readonly running: boolean;
  /** Resizes the renderer and camera aspect. */
  resize(width: number, height: number): void;
  /** Stops, drops updaters and disposes the renderer. */
  dispose(): void;
}

/** Largest dt passed to updaters, to survive tab stalls. */
export const MAX_FRAME_DT = 0.25;

function recordTimings(t: LoopTimings, updateMs: number, renderMs: number): void {
  t.updateMs = updateMs;
  t.renderMs = renderMs;
  t.avgUpdateMs += (updateMs - t.avgUpdateMs) * 0.1;
  t.avgRenderMs += (renderMs - t.avgRenderMs) * 0.1;
}

function fitCamera(camera: THREE.PerspectiveCamera, width: number, height: number): void {
  camera.aspect = width / Math.max(1, height);
  camera.updateProjectionMatrix();
}

/** Holds the optional post chain of a loop and keeps it sized. */
class PostSlot {
  chain: FrameRenderer | null = null;
  private size: [number, number] | null = null;
  private closed = false;

  set(next: FrameRenderer | null): void {
    if (this.chain && this.chain !== next) this.chain.dispose();
    if (this.closed) {
      next?.dispose();
      this.chain = null;
      return;
    }
    this.chain = next;
    if (next && this.size) next.setSize(this.size[0], this.size[1]);
  }

  resize(width: number, height: number): void {
    this.size = [width, height];
    this.chain?.setSize(width, height);
  }

  close(): void {
    this.closed = true;
    this.chain?.dispose();
    this.chain = null;
  }
}

/** Creates a render loop; call start() to begin pulling frames. */
export function createRenderLoop(deps: RenderLoopDeps): RenderLoop {
  const { renderer, scene, camera, scheduler, now } = deps;
  const updaters = new Set<FrameUpdater>();
  let source: RenderStateSource | null = deps.source ?? null;
  let handle: number | null = null;
  let last = 0;
  let disposed = false;
  const post = new PostSlot();
  const timings: LoopTimings = { updateMs: 0, renderMs: 0, avgUpdateMs: 0, avgRenderMs: 0 };
  renderer.setPixelRatio(deps.pixelRatio);
  const frame = (): void => {
    handle = scheduler.request(frame);
    const t = now();
    const dt = Math.min(MAX_FRAME_DT, Math.max(0, (t - last) / 1000));
    last = t;
    const state = source?.getState() ?? null;
    for (const u of updaters) u(dt, state);
    const t1 = now();
    if (post.chain) post.chain.render(dt);
    else renderer.render(scene, camera);
    const t2 = now();
    recordTimings(timings, t1 - t, t2 - t1);
  };
  const stop = (): void => {
    if (handle !== null) scheduler.cancel(handle);
    handle = null;
  };
  return {
    timings,
    addUpdater(fn) {
      updaters.add(fn);
      return () => void updaters.delete(fn);
    },
    setSource: (s) => void (source = s),
    start() {
      if (disposed || handle !== null) return;
      last = now();
      handle = scheduler.request(frame);
    },
    stop,
    setPost: (next) => post.set(next),
    get running() {
      return handle !== null;
    },
    resize(width, height) {
      renderer.setSize(width, height, false);
      post.resize(width, height);
      fitCamera(camera, width, height);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      stop();
      updaters.clear();
      source = null;
      post.close();
      renderer.dispose();
    },
  };
}
