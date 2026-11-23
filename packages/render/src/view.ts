import { configureRenderer } from './style/renderer-setup.js';
import * as THREE from 'three';
import {
  applyQuality,
  qualitySettings,
  type QualitySettings,
  type QualityTier,
} from './quality.js';
import {
  createRenderLoop,
  type FrameScheduler,
  type FrameUpdater,
  type RenderLoop,
  type RendererLike,
  type RenderStateSource,
} from './render-loop.js';
import { createEnvironment } from './environment/environment.js';
import type { Bounds3 } from './environment/lighting.js';
import { createSceneGraph, type SceneRoots } from './scene-graph.js';

const SHADOW_TYPES = {
  pcfsoft: THREE.PCFSoftShadowMap,
  pcf: THREE.PCFShadowMap,
  basic: THREE.BasicShadowMap,
} as const;

/** Options for createGameView. */
export interface GameViewOptions {
  tier: QualityTier;
  /** Optional state source pulled each frame. */
  source?: RenderStateSource;
  /** Terrain world bounds (defaults to the core default arena). */
  terrainBounds?: Bounds3;
  /** Water surface height (defaults to the core default water level). */
  waterLevel?: number;
  /** Called once with the WebGL renderer (for `info` stats overlays). */
  onRenderer?: (renderer: THREE.WebGLRenderer) => void;
  /** Frame scheduler override (defaults to requestAnimationFrame), e.g. an fps-capped one. */
  scheduler?: FrameScheduler;
  /** WebGL power preference hint (iOS Safari largely ignores it). */
  powerPreference?: 'default' | 'high-performance' | 'low-power';
}

/** Handle to a running game view. */
export interface GameView {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  roots: SceneRoots;
  loop: RenderLoop;
  addUpdater(fn: FrameUpdater): () => void;
  setSource(source: RenderStateSource | null): void;
  resize(width: number, height: number): void;
  /** Current quality tier. */
  readonly tier: QualityTier;
  /** Current resolved quality settings (e.g. chunkBudgetMs, particleScale). */
  readonly quality: QualitySettings;
  /** Switches tier at runtime (pixel ratio, shadow flag, draw distance); see applyQuality. */
  setTier(tier: QualityTier): void;
  dispose(): void;
}

/** Dependencies for createGameViewWith (injectable for tests). */
export interface GameViewDeps {
  tier: QualityTier;
  devicePixelRatio: number;
  renderer: RendererLike;
  scheduler: FrameScheduler;
  now: () => number;
  source?: RenderStateSource;
  terrainBounds?: Bounds3;
  waterLevel?: number;
}

/** Builds scene, camera, lights and a started render loop from injected deps. */
export function createGameViewWith(deps: GameViewDeps): GameView {
  const q = qualitySettings(deps.tier, deps.devicePixelRatio);
  const { scene, roots } = createSceneGraph();
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 500 * q.drawDistanceScale);
  camera.position.set(0, 4, 10);
  camera.lookAt(0, 0, 0);

  const env = createEnvironment(roots.environment, {
    tier: deps.tier,
    ...(deps.terrainBounds ? { bounds: deps.terrainBounds } : {}),
    ...(deps.waterLevel !== undefined ? { waterLevel: deps.waterLevel } : {}),
  });
  env.applyTo(scene);
  const fitFog = (): void => {
    // Fade distant terrain/water into the sky before the far plane so no edge shows.
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.near = camera.far * 0.35;
      scene.fog.far = camera.far * 0.95;
    }
  };
  fitFog();

  const loop = createRenderLoop({
    renderer: deps.renderer,
    scene,
    camera,
    scheduler: deps.scheduler,
    now: deps.now,
    pixelRatio: q.pixelRatio,
    ...(deps.source ? { source: deps.source } : {}),
  });
  const removeEnvUpdater = loop.addUpdater(env.update);
  loop.start();
  const state = { tier: deps.tier, quality: q };
  return {
    get tier() {
      return state.tier;
    },
    get quality() {
      return state.quality;
    },
    setTier: (tier) => {
      state.tier = tier;
      state.quality = applyQuality(deps.renderer, tier, deps.devicePixelRatio);
      camera.far = 500 * state.quality.drawDistanceScale;
      camera.updateProjectionMatrix();
      fitFog();
    },
    scene,
    camera,
    roots,
    loop,
    addUpdater: (fn) => loop.addUpdater(fn),
    setSource: (s) => loop.setSource(s),
    resize: (w, h) => loop.resize(w, h),
    dispose: () => {
      removeEnvUpdater();
      env.dispose();
      loop.dispose();
    },
  };
}

/** Creates a WebGL renderer on a canvas, builds the view and starts rAF rendering. */
export function createGameView(canvas: HTMLCanvasElement, opts: GameViewOptions): GameView {
  const q = qualitySettings(opts.tier, window.devicePixelRatio);
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: q.antialias,
    ...(opts.powerPreference ? { powerPreference: opts.powerPreference } : {}),
  });
  configureRenderer(renderer);
  opts.onRenderer?.(renderer);
  renderer.shadowMap.enabled = q.shadows;
  renderer.shadowMap.type = SHADOW_TYPES[q.shadowType];
  const view = createGameViewWith({
    tier: opts.tier,
    devicePixelRatio: window.devicePixelRatio,
    renderer,
    scheduler: opts.scheduler ?? {
      request: (cb) => window.requestAnimationFrame(cb),
      cancel: (h) => window.cancelAnimationFrame(h),
    },
    now: () => performance.now(),
    ...(opts.source ? { source: opts.source } : {}),
    ...(opts.terrainBounds ? { terrainBounds: opts.terrainBounds } : {}),
    ...(opts.waterLevel !== undefined ? { waterLevel: opts.waterLevel } : {}),
  });
  view.resize(canvas.clientWidth || 1, canvas.clientHeight || 1);
  return view;
}
