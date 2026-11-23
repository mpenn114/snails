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
      onRenderer: (r) => (glRenderer = r),
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
function frame(nowMs: number): void {
  const dtMs = nowMs - last;
  last = nowMs;
  frames.record(dtMs);
  server.advance(dtMs / 1000);
  if (nowMs - lastOverlay > 250) {
    lastOverlay = nowMs;
    updateOverlay({
      frames,
      rebuild: renderer.terrainMeshes?.stats ?? null,
      calls: glRenderer?.info.render.calls ?? 0,
      triangles: glRenderer?.info.render.triangles ?? 0,
      snails: server.sim.state.teams.flatMap((t) => t.snails).filter((s) => s.alive).length,
      tier,
      ticks: server.ticks,
      geometries: glRenderer?.info.memory.geometries ?? 0,
      textures: glRenderer?.info.memory.textures ?? 0,
      timings: profile ? (renderer.view?.loop.timings ?? null) : null,
    });
    (window as unknown as { __perf?: unknown }).__perf = {
      calls: glRenderer?.info.render.calls ?? 0,
      triangles: glRenderer?.info.render.triangles ?? 0,
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
