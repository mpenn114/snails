import type * as THREE from 'three';
import type { GameSnapshot } from '@snails/core';

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

/** Controllable frame loop. */
export interface RenderLoop {
  /** Registers a per-frame updater; returns an unregister function. */
  addUpdater(fn: FrameUpdater): () => void;
  /** Replaces the state source. */
  setSource(source: RenderStateSource | null): void;
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

/** Creates a render loop; call start() to begin pulling frames. */
export function createRenderLoop(deps: RenderLoopDeps): RenderLoop {
  const { renderer, scene, camera, scheduler, now } = deps;
  const updaters = new Set<FrameUpdater>();
  let source: RenderStateSource | null = deps.source ?? null;
  let handle: number | null = null;
  let last = 0;
  let disposed = false;
  renderer.setPixelRatio(deps.pixelRatio);

  const frame = (): void => {
    handle = scheduler.request(frame);
    const t = now();
    const dt = Math.min(MAX_FRAME_DT, Math.max(0, (t - last) / 1000));
    last = t;
    const state = source?.getState() ?? null;
    for (const u of [...updaters]) u(dt, state);
    renderer.render(scene, camera);
  };

  const stop = (): void => {
    if (handle !== null) scheduler.cancel(handle);
    handle = null;
  };

  return {
    addUpdater(fn) {
      updaters.add(fn);
      return () => void updaters.delete(fn);
    },
    setSource(s) {
      source = s;
    },
    start() {
      if (disposed || handle !== null) return;
      last = now();
      handle = scheduler.request(frame);
    },
    stop,
    get running() {
      return handle !== null;
    },
    resize(width, height) {
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      stop();
      updaters.clear();
      source = null;
      renderer.dispose();
    },
  };
}
