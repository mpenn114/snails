import { FIXED_DT, createMatch, createScriptedBot, type SimEvent, type Vec3 } from '@snails/core';
import { MatchRenderer, QUALITY_TIERS, createGameView, type QualityTier } from '@snails/render';
import { HARNESS_WEAPON, harnessMatchOptions } from './fake-server';

/** Fixed camera framings for reference screenshots. */
export const SHOT_CAMS = ['close', 'wide', 'crater'] as const;
/** A framing name. */
export type ShotCam = (typeof SHOT_CAMS)[number];

/** Sim ticks stepped before capture so snails settle onto the terrain. */
const SETTLE_TICKS = 150;
/** Extra ticks after the first impact in the crater shot. */
const AFTER_BLAST_TICKS = 20;
/** Give up waiting for a first explosion after this many ticks. */
const MAX_BLAST_TICKS = 4000;
/** Rendered frames (simulated 60 fps) after the scene is built, before ready. */
const SETTLE_FRAMES = 20;
/** Frames of explosion effects shown in the crater shot. */
const EXPLOSION_FRAMES = 14;
const FRAME_MS = 1000 / 60;

/** Deterministic PRNG (mulberry32) so particles are identical between runs. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Camera position and look-at for a framing. */
export interface ShotPose {
  eye: Vec3;
  look: Vec3;
}

/** Computes the fixed pose of `cam` around a snail, the explosion point and the arena size. */
export function shotPose(
  cam: ShotCam,
  snail: Vec3,
  blast: Vec3 | null,
  world: Vec3,
  facing = 0,
): ShotPose {
  if (cam === 'close') {
    // Three-quarter view from in front of the snail, so its face and shell both read.
    const a = facing + 0.8;
    return {
      eye: { x: snail.x + Math.cos(a) * 3.4, y: snail.y + 1.2, z: snail.z + Math.sin(a) * 3.4 },
      look: { x: snail.x, y: snail.y + 0.55, z: snail.z },
    };
  }
  if (cam === 'crater' && blast) {
    return { eye: { x: blast.x + 7, y: blast.y + 6, z: blast.z + 9 }, look: blast };
  }
  return {
    eye: { x: world.x * 0.5, y: world.y + 17, z: world.z * 0.5 + 34 },
    look: { x: world.x * 0.5, y: world.y * 0.2, z: world.z * 0.5 + 1 },
  };
}

interface ShotWindow {
  __shotReady?: boolean;
  __shotInfo?: unknown;
}

/** Steps the sim (bots only for the crater shot); returns all events and the first blast. */
function stepScene(
  sim: ReturnType<typeof createMatch>['sim'],
  cam: ShotCam,
  bots: ((s: typeof sim) => void)[],
): { events: SimEvent[]; blast: Vec3 | null } {
  const events: SimEvent[] = [];
  let blast: Vec3 | null = null;
  const limit = cam === 'crater' ? MAX_BLAST_TICKS : SETTLE_TICKS;
  for (let i = 0; i < limit; i++) {
    if (cam === 'crater') for (const bot of bots) bot(sim);
    const evs = sim.step(FIXED_DT);
    events.push(...evs);
    const hit = evs.find((e) => e.type === 'explosion');
    if (hit && cam === 'crater') {
      blast = hit.position;
      for (let k = 0; k < AFTER_BLAST_TICKS; k++) events.push(...sim.step(FIXED_DT));
      break;
    }
  }
  return { events, blast };
}

/** Builds a renderer on a manual scheduler and simulated clock; `frame(dtMs)` renders one frame. */
function makeShotRenderer(
  canvas: HTMLCanvasElement,
  tier: QualityTier,
  seed: number,
): { renderer: MatchRenderer; frame: (dtMs: number) => Promise<void> } {
  const clock = { ms: 0 };
  let pending: ((t: number) => void) | null = null;
  const scheduler = {
    request: (cb: (t: number) => void) => ((pending = cb), 1),
    cancel: () => void (pending = null),
  };
  const renderer = new MatchRenderer({
    now: () => clock.ms,
    modelBaseUrl: `${import.meta.env.BASE_URL}models/`,
    random: seededRandom(seed),
    makeView: ({ bounds, waterLevel }) =>
      createGameView(canvas, {
        tier,
        terrainBounds: bounds,
        waterLevel,
        scheduler,
        now: () => clock.ms,
      }),
  });
  const frame = async (dtMs: number): Promise<void> => {
    clock.ms += dtMs;
    const cb = pending;
    pending = null;
    cb?.(clock.ms);
    await new Promise((r) => setTimeout(r, 0));
  };
  return { renderer, frame };
}

/**
 * Deterministic capture mode (`?shot=1&cam=close|wide|crater&seed=&quality=`). Time is
 * simulated (fixed dt per frame, manual scheduler), randomness is seeded, so repeated loads
 * render identical frames. Sets `window.__shotReady` once terrain meshing is done and frames
 * have rendered.
 */
export async function runShot(canvas: HTMLCanvasElement, params: URLSearchParams): Promise<void> {
  const cam = SHOT_CAMS.find((c) => c === params.get('cam')) ?? 'wide';
  const tier: QualityTier =
    QUALITY_TIERS.find((t) => t === (params.get('quality') ?? params.get('tier'))) ?? 'high';
  const seed = Number(params.get('seed') ?? 7);
  const { renderer, frame } = makeShotRenderer(canvas, tier, seed);
  renderer.setTier(tier);
  renderer.resize(window.innerWidth, window.innerHeight);

  const options = harnessMatchOptions({ seed, teams: 3, snailsPerTeam: 3 });
  const sim = createMatch(options).sim;
  renderer.init({ grid: sim.terrain, waterLevel: sim.state.terrain.waterLevel });
  const bots = options.teams.map((t) => createScriptedBot(t.id, HARNESS_WEAPON));
  const { events, blast } = stepScene(sim, cam, bots);

  const active = sim.state.teams[0]?.snails[0];
  const snail = active?.position ?? { x: 0, y: 0, z: 0 };
  const pose = shotPose(cam, snail, blast, sim.terrain.worldSize(), active?.facing ?? 0);
  renderer.cameraRig?.setTarget(pose.look);
  renderer.addLayer({
    name: 'shot-camera',
    updater: () => {
      const c = renderer.view?.camera;
      if (!c) return;
      c.position.set(pose.eye.x, pose.eye.y, pose.eye.z);
      c.lookAt(pose.look.x, pose.look.y, pose.look.z);
    },
  });

  const propsSettled = (): boolean => renderer.propLayer?.settled ?? true;
  // Zero-dt frames: waiting on worker meshing must not advance simulated time.
  const settle = async (): Promise<void> => {
    for (let i = 0; i < 6000 && !(renderer.terrainMeshes?.idle && propsSettled() && i > 3); i++)
      await frame(0);
  };

  renderer.pushSnapshot(sim.snapshot());
  await settle();
  if (cam === 'crater') {
    renderer.terrainReplica?.applyEvents(events);
    await settle();
    renderer.explosionEffects?.handleEvents(events);
    for (let i = 0; i < EXPLOSION_FRAMES; i++) await frame(FRAME_MS);
  }
  for (let i = 0; i < SETTLE_FRAMES; i++) await frame(FRAME_MS);
  await settle();
  await frame(0);
  const w = window as unknown as ShotWindow;
  w.__shotInfo = { cam, tier, seed, blast, snail };
  w.__shotReady = true;
}
