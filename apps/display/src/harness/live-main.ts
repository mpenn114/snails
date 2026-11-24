import { MatchRenderer, QUALITY_TIERS, createGameView, pickDefaultTier } from '@snails/render';
import type { QualityTier } from '@snails/render';
import { createFakeServer } from './fake-server';
import { createFrameStats } from './frame-stats';
import { createOverlay } from './overlay';
import { TERRAIN_TEXTURES } from '../terrain-textures';

/**
 * Harness entry: a local fake server runs a 16-snail bot match in the browser and feeds the
 * MatchRenderer like the network would. URL params: `profile=1` (CPU timings), `seed`, `speed`, `tier`, `snapshotEvery`.
 */
const canvas = document.getElementById('view') as HTMLCanvasElement;
const params = new URLSearchParams(location.search);
const num = (key: string, fallback: number): number => {
  const v = Number(params.get(key));
  return params.has(key) && Number.isFinite(v) ? v : fallback;
};
const tier: QualityTier =
  QUALITY_TIERS.find((t) => t === params.get('tier')) ??
  pickDefaultTier({
    isMobile: false,
    dpr: window.devicePixelRatio,
    hardwareConcurrency: navigator.hardwareConcurrency || 4,
  });

interface GlInfo {
  info: {
    render: { calls: number; triangles: number };
    memory: { geometries: number; textures: number };
    programs?: unknown[] | null;
  };
}
interface GlResettable extends GlInfo {
  info: GlInfo['info'] & { autoReset: boolean; reset(): void };
}
let glRenderer: GlInfo | null = null;
const profile = params.get('profile') === '1';
const renderer = new MatchRenderer({
  terrainTextures: TERRAIN_TEXTURES,
  now: () => performance.now(),
  modelBaseUrl: `${import.meta.env.BASE_URL}models/`,
  makeView: ({ bounds, waterLevel }) =>
    createGameView(canvas, {
      tier,
      terrainBounds: bounds,
      waterLevel,
      postProcessing: params.get('post') !== '0',
      onRenderer: (r) => {
        // Post-processing renders several passes per frame; accumulate them and reset once per
        // harness frame so the counters cover the whole frame, not just the last pass.
        (r as GlResettable).info.autoReset = false;
        glRenderer = r;
      },
    }),
});
renderer.setTier(tier);
const onResize = (): void => renderer.resize(window.innerWidth, window.innerHeight);
window.addEventListener('resize', onResize);
onResize();

const server = createFakeServer({
  seed: num('seed', 1),
  speed: num('speed', 1),
  snapshotEvery: num('snapshotEvery', 3),
  sink: {
    onInit: (init) => renderer.init(init),
    onSnapshot: (s) => void renderer.pushSnapshot(s),
    onEvents: (e) => renderer.handleEvents(e),
  },
});

const frames = createFrameStats();
const updateOverlay = createOverlay(document.body);
let last = performance.now();
let lastOverlay = 0;
/** Whole-frame counters of the previous frame (all post passes), read before each reset. */
let frameCalls = 0;
let frameTriangles = 0;
function frame(nowMs: number): void {
  const dtMs = nowMs - last;
  last = nowMs;
  frames.record(dtMs);
  const gl = glRenderer as GlResettable | null;
  if (gl) {
    frameCalls = gl.info.render.calls;
    frameTriangles = gl.info.render.triangles;
    gl.info.reset();
  }
  server.advance(dtMs / 1000);
  if (nowMs - lastOverlay > 250) {
    lastOverlay = nowMs;
    updateOverlay({
      frames,
      rebuild: renderer.terrainMeshes?.stats ?? null,
      calls: frameCalls,
      triangles: frameTriangles,
      snails: server.sim.state.teams.flatMap((t) => t.snails).filter((s) => s.alive).length,
      tier,
      ticks: server.ticks,
      geometries: glRenderer?.info.memory.geometries ?? 0,
      textures: glRenderer?.info.memory.textures ?? 0,
      timings: profile ? (renderer.view?.loop.timings ?? null) : null,
    });
    (window as unknown as { __perf?: unknown }).__perf = {
      calls: frameCalls,
      triangles: frameTriangles,
      geometries: glRenderer?.info.memory.geometries ?? 0,
      textures: glRenderer?.info.memory.textures ?? 0,
      programs: glRenderer?.info.programs?.length ?? 0,
      timings: renderer.view?.loop.timings ?? null,
      chunks: renderer.terrainMeshes?.stats ?? null,
    };
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
