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
}

/** The scenery set (docs/art-direction.md section 5: mushrooms, pebbles, clover, flowers, logs). */
export const PROP_KINDS: readonly PropKind[] = [
  { file: 'grass-a.glb', weight: 14, scale: [0.8, 1.3], tint: 0.06, lean: 0.3, castShadow: false },
  { file: 'grass-b.glb', weight: 14, scale: [0.8, 1.3], tint: 0.06, lean: 0.3, castShadow: false },
  { file: 'plant-a.glb', weight: 8, scale: [0.8, 1.2], tint: 0.06, lean: 0.4, castShadow: false },
  { file: 'plant-b.glb', weight: 6, scale: [0.8, 1.2], tint: 0.06, lean: 0.4, castShadow: false },
  { file: 'flowers-a.glb', weight: 8, scale: [0.8, 1.2], tint: 0, lean: 0.3, castShadow: false },
  { file: 'flower-b.glb', weight: 7, scale: [0.8, 1.3], tint: 0, lean: 0.3, castShadow: false },
  { file: 'mushroom-a.glb', weight: 6, scale: [0.8, 1.4], tint: 0, lean: 0.3, castShadow: true },
  { file: 'mushroom-b.glb', weight: 4, scale: [0.8, 1.3], tint: 0, lean: 0.3, castShadow: true },
  { file: 'mushroom-c.glb', weight: 4, scale: [0.8, 1.3], tint: 0, lean: 0.3, castShadow: true },
  { file: 'rock-a.glb', weight: 5, scale: [0.6, 1.3], tint: 0.1, lean: 0.7, castShadow: true },
  { file: 'rock-b.glb', weight: 5, scale: [0.6, 1.3], tint: 0.1, lean: 0.7, castShadow: true },
  { file: 'rock-c.glb', weight: 4, scale: [0.6, 1.2], tint: 0.1, lean: 0.7, castShadow: true },
  { file: 'rock-d.glb', weight: 6, scale: [0.6, 1.4], tint: 0.1, lean: 0.7, castShadow: true },
  { file: 'log-a.glb', weight: 2, scale: [0.8, 1.1], tint: 0.04, lean: 0.8, castShadow: true },
  { file: 'stump-a.glb', weight: 2, scale: [0.8, 1.2], tint: 0.04, lean: 0.5, castShadow: true },
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
export const AVOID_RADIUS = 1.2;
const EDGE_MARGIN = 1;
const MIN_SPACING = 0.45;
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
  const out: PropPlacement[] = [];
  for (let tries = 0; out.length < opts.count && tries < opts.count * 8; tries++) {
    const x = EDGE_MARGIN + rnd() * (ws.x - 2 * EDGE_MARGIN);
    const z = EDGE_MARGIN + rnd() * (ws.z - 2 * EDGE_MARGIN);
    const kindIndex = pickKind(kinds, total, rnd());
    const kind = kinds[kindIndex] as PropKind;
    const yaw = rnd() * Math.PI * 2;
    const scale = kind.scale[0] + rnd() * (kind.scale[1] - kind.scale[0]);
    const tint = 1 + (rnd() * 2 - 1) * kind.tint;
    const y = surfaceHeight(opts.grid, x, z);
    if (y === null || y < opts.waterLevel + WATER_MARGIN) continue;
    const normal = opts.grid.normal({ x, y, z });
    if (normal.y < MIN_NORMAL_Y) continue;
    if (tooClose(opts.avoid ?? [], x, y, z, AVOID_RADIUS)) continue;
    if (out.some((p) => Math.hypot(p.x - x, p.z - z) < MIN_SPACING)) continue;
    out.push({ kind: kindIndex, x, y, z, yaw, scale, tint, normal });
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
