import { MatchRenderer, QUALITY_TIERS, createGameView, pickDefaultTier } from '@snails/render';
import type { QualityTier } from '@snails/render';
import { createFakeServer } from './fake-server';
import { createFrameStats } from './frame-stats';
import { createOverlay } from './overlay';

/**
 * Harness entry: a local fake server runs a 16-snail bot match in the browser and feeds the
 * MatchRenderer like the network would. URL params: `seed`, `speed`, `tier`, `snapshotEvery`.
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

let glRenderer: { info: { render: { calls: number; triangles: number } } } | null = null;
const renderer = new MatchRenderer({
  now: () => performance.now(),
  makeView: ({ bounds, waterLevel }) =>
    createGameView(canvas, {
      tier,
      terrainBounds: bounds,
      waterLevel,
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
    });
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
