import type { SdfGrid } from '@snails/core';
import { seededRandom } from '../snail/shell-geometry.js';

/** One kind of scenery prop: which model, how common, how big. */
export interface PropKind {
  /** File name inside the models folder. */
  file: string;
  /** Relative frequency. */
  weight: number;
  /** Uniform scale range applied on top of the model's authored size. */
  scale: readonly [number, number];
  /** Per-instance brightness jitter (0 = none; 0.1 = plus or minus 10%). */
  tint: number;
  /** How strongly the prop leans onto the surface normal (0 upright, 1 flush). */
  lean: number;
  /** Casts a shadow (only larger props, to keep the shadow pass cheap). */
  castShadow: boolean;
  /** Tall props (mushrooms, logs, stumps) stay out of the {@link NEAR_RADIUS} around snails. */
  tall?: boolean;
  /** Only grows inside the dense patches of the second noise field (mushroom rings). */
  patchy?: boolean;
  /** Cap colours (hex) a variant can take; replaces the model's red/tan cap colours. */
  capColors?: readonly number[];
}

/**
 * Muted mushroom cap colours: cream, tan, soft brown and one dusty brick red. Every one stays far
 * (CIE76 delta E above 25) from every team colour so mushrooms never read as a snail shell.
 */
export const MUSHROOM_CAPS: readonly number[] = [0xd8c8a0, 0xc9a56e, 0x9a7352, 0x7a5a48, 0x9b5d4f];

/** Model cap colours (see scripts/prepare-models.mjs) that {@link MUSHROOM_CAPS} replace. */
export const MODEL_CAP_COLORS: readonly number[] = [0xd8452f, 0xc9954f];

/** The scenery set (docs/art-direction.md section 5: mushrooms, pebbles, clover, flowers, logs). */
export const PROP_KINDS: readonly PropKind[] = [
  { file: 'grass-a.glb', weight: 18, scale: [0.8, 1.3], tint: 0.06, lean: 0.3, castShadow: false },
  { file: 'grass-b.glb', weight: 18, scale: [0.8, 1.3], tint: 0.06, lean: 0.3, castShadow: false },
  { file: 'plant-a.glb', weight: 8, scale: [0.8, 1.2], tint: 0.06, lean: 0.4, castShadow: false },
  { file: 'plant-b.glb', weight: 6, scale: [0.8, 1.2], tint: 0.06, lean: 0.4, castShadow: false },
  { file: 'flowers-a.glb', weight: 8, scale: [0.8, 1.2], tint: 0, lean: 0.3, castShadow: false },
  { file: 'flower-b.glb', weight: 7, scale: [0.8, 1.3], tint: 0, lean: 0.3, castShadow: false },
  {
    file: 'mushroom-a.glb',
    weight: 3,
    scale: [0.45, 0.8],
    tint: 0,
    lean: 0.3,
    castShadow: true,
    tall: true,
    patchy: true,
    capColors: MUSHROOM_CAPS,
  },
  {
    file: 'mushroom-b.glb',
    weight: 2,
    scale: [0.45, 0.8],
    tint: 0,
    lean: 0.3,
    castShadow: true,
    tall: true,
    patchy: true,
    capColors: MUSHROOM_CAPS,
  },
  {
    file: 'mushroom-c.glb',
    weight: 2,
    scale: [0.45, 0.8],
    tint: 0,
    lean: 0.3,
    castShadow: true,
    tall: true,
    patchy: true,
    capColors: MUSHROOM_CAPS,
  },
  { file: 'rock-a.glb', weight: 4, scale: [0.5, 1], tint: 0.1, lean: 0.7, castShadow: true },
  { file: 'rock-b.glb', weight: 4, scale: [0.5, 1], tint: 0.1, lean: 0.7, castShadow: true },
  { file: 'rock-c.glb', weight: 3, scale: [0.5, 1], tint: 0.1, lean: 0.7, castShadow: true },
  { file: 'rock-d.glb', weight: 5, scale: [0.5, 1], tint: 0.1, lean: 0.7, castShadow: true },
  {
    file: 'log-a.glb',
    weight: 1,
    scale: [0.7, 1],
    tint: 0.04,
    lean: 0.8,
    castShadow: true,
    tall: true,
  },
  {
    file: 'stump-a.glb',
    weight: 1,
    scale: [0.7, 1],
    tint: 0.04,
    lean: 0.5,
    castShadow: true,
    tall: true,
  },
];

/** Where one prop stands. */
export interface PropPlacement {
  /** Index into the kinds array. */
  kind: number;
  x: number;
  y: number;
  z: number;
  /** Yaw about +Y. */
  yaw: number;
  scale: number;
  /** Index into the kind's `capColors` (0 when it has none). */
  variant: number;
  /** Brightness multiplier (1 = unchanged). */
  tint: number;
  /** Unit surface normal under the prop. */
  normal: { x: number; y: number; z: number };
}

/** Inputs for {@link planProps}. */
export interface PropPlanOptions {
  grid: SdfGrid;
  /** Cosmetic seed (see {@link seedFromGrid}). */
  seed: number;
  /** How many props to try to place. */
  count: number;
  /** Water surface height; props stay above it. */
  waterLevel: number;
  /** Points (e.g. snail spawns) that keep clear of props. */
  avoid?: readonly { x: number; y: number; z: number }[];
  kinds?: readonly PropKind[];
}

/** Props keep this far (m) from avoided points, from the map edge, and from each other. */
export const AVOID_RADIUS = 1.8;
/** Tall props keep this far (m) from avoided points so snails are never hidden behind them. */
export const NEAR_RADIUS = 3.5;
/** Metres per noise cell of the cluster fields (patches are a few metres across). */
const CLUSTER_SCALE = 6;
/** Chance (0..1) a prop survives outside a cluster; inside one it is certain. */
const SPARSE_KEEP = 0.12;
const EDGE_MARGIN = 1;
const MIN_SPACING = 0.5;
/** Lowest allowed normal.y: no props on steep walls. */
export const MIN_NORMAL_Y = 0.72;
/** Height above the water line below which nothing is placed. */
const WATER_MARGIN = 0.2;

/** Cheap deterministic seed from the terrain contents, so the same map gets the same props. */
export function seedFromGrid(grid: SdfGrid): number {
  let h = 0x811c9dc5;
  const step = Math.max(1, Math.floor(grid.data.length / 509));
  for (let i = 0; i < grid.data.length; i += step) {
    h ^= Math.round((grid.data[i] as number) * 64) & 0xffff;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Highest terrain surface in the column (x, z), or null when it is all air. */
export function surfaceHeight(grid: SdfGrid, x: number, z: number): number | null {
  const step = grid.cellSize * 0.5;
  let prevY = grid.worldSize().y;
  let prev = grid.sampleLinear({ x, y: prevY, z });
  if (prev < 0) return prevY;
  for (let y = prevY - step; y >= 0; y -= step) {
    const v = grid.sampleLinear({ x, y, z });
    if (v < 0) return prevY + ((y - prevY) * prev) / (prev - v);
    prevY = y;
    prev = v;
  }
  return null;
}

function hash2(seed: number, ix: number, iz: number): number {
  let h = Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iz, 0x165667b1) ^ seed;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/** Smooth value noise in 0..1 over the ground plane (cells of `scale` metres). */
export function clusterNoise(seed: number, x: number, z: number, scale = CLUSTER_SCALE): number {
  const fx = x / scale;
  const fz = z / scale;
  const ix = Math.floor(fx);
  const iz = Math.floor(fz);
  const tx = fx - ix;
  const tz = fz - iz;
  const sx = tx * tx * (3 - 2 * tx);
  const sz = tz * tz * (3 - 2 * tz);
  const a = hash2(seed, ix, iz);
  const b = hash2(seed, ix + 1, iz);
  const c = hash2(seed, ix, iz + 1);
  const d = hash2(seed, ix + 1, iz + 1);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}

function smooth(lo: number, hi: number, v: number): number {
  const t = Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
}

function pickKind(kinds: readonly PropKind[], total: number, r: number): number {
  let t = r * total;
  for (let i = 0; i < kinds.length; i++) {
    t -= (kinds[i] as PropKind).weight;
    if (t < 0) return i;
  }
  return kinds.length - 1;
}

/**
 * Deterministically scatters props over the terrain surface: rejection sampling on the column
 * surface (above water, not steep, off the edge, clear of `avoid` points and each other).
 * Cosmetic only: uses its own RNG and never touches the simulation.
 */
export function planProps(opts: PropPlanOptions): PropPlacement[] {
  const kinds = opts.kinds ?? PROP_KINDS;
  const total = kinds.reduce((s, k) => s + k.weight, 0);
  const rnd = seededRandom(opts.seed);
  const ws = opts.grid.worldSize();
  const seedA = (opts.seed ^ 0x9e3779b9) >>> 0;
  const seedB = (opts.seed ^ 0x85ebca6b) >>> 0;
  const out: PropPlacement[] = [];
  for (let tries = 0; out.length < opts.count && tries < opts.count * 24; tries++) {
    const x = EDGE_MARGIN + rnd() * (ws.x - 2 * EDGE_MARGIN);
    const z = EDGE_MARGIN + rnd() * (ws.z - 2 * EDGE_MARGIN);
    const kindIndex = pickKind(kinds, total, rnd());
    const kind = kinds[kindIndex] as PropKind;
    const keepRoll = rnd();
    const variant = Math.floor(rnd() * (kind.capColors?.length ?? 1));
    const patch = smooth(0.45, 0.62, clusterNoise(seedA, x, z));
    const mushroomPatch = smooth(0.58, 0.72, clusterNoise(seedB, x, z, 4));
    if (keepRoll > SPARSE_KEEP + (1 - SPARSE_KEEP) * patch) continue;
    if (kind.patchy && keepRoll > mushroomPatch * 0.6) continue;
    const yaw = rnd() * Math.PI * 2;
    const scale = kind.scale[0] + rnd() * (kind.scale[1] - kind.scale[0]);
    const tint = 1 + (rnd() * 2 - 1) * kind.tint;
    const y = surfaceHeight(opts.grid, x, z);
    if (y === null || y < opts.waterLevel + WATER_MARGIN) continue;
    const normal = opts.grid.normal({ x, y, z });
    if (normal.y < MIN_NORMAL_Y) continue;
    const avoid = opts.avoid ?? [];
    if (tooClose(avoid, x, y, z, AVOID_RADIUS)) continue;
    if (kind.tall && tooClose(avoid, x, y, z, NEAR_RADIUS)) continue;
    if (out.some((p) => Math.hypot(p.x - x, p.z - z) < MIN_SPACING)) continue;
    out.push({ kind: kindIndex, x, y, z, yaw, scale, variant, tint, normal });
  }
  return out;
}

function tooClose(
  points: readonly { x: number; y: number; z: number }[],
  x: number,
  y: number,
  z: number,
  r: number,
): boolean {
  return points.some((p) => Math.hypot(p.x - x, p.y - y, p.z - z) < r);
}

/** Distance (m) under a prop at which terrain must still be solid for it to stay. */
const GROUND_PROBE = 0.15;

/**
 * True while the ground under a placement still exists (solid just below, so a carve or collapse
 * that removed it makes this false and the prop is dropped).
 */
export function hasGround(grid: SdfGrid, p: { x: number; y: number; z: number }): boolean {
  return grid.sampleLinear({ x: p.x, y: p.y - GROUND_PROBE, z: p.z }) < 0;
}
