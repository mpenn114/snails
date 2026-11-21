import type { Vec3 } from '../state/types.js';
import { add, distance, normalize, scale, sub } from '../math/vec3.js';

/** Minimal SDF interface needed for collision queries (satisfied by `SdfGrid`). */
export interface SdfQuery {
  readonly cellSize: number;
  /** Trilinearly interpolated signed distance; negative = solid. */
  sampleLinear(p: Vec3): number;
  /** Unit surface normal at p. */
  normal(p: Vec3): Vec3;
}

/** Result of a ray cast. */
export interface RayHit {
  point: Vec3;
  normal: Vec3;
  distance: number;
}

/** Result of a sphere sweep. */
export interface SweepHit {
  /** Sphere centre at contact. */
  point: Vec3;
  normal: Vec3;
  /** Fraction along the path, 0..1. */
  t: number;
}

const MAX_STEPS = 256;
const BISECT_STEPS = 8;

function bisect(
  grid: SdfQuery,
  origin: Vec3,
  dir: Vec3,
  lo: number,
  hi: number,
  offset: number,
): number {
  let a = lo;
  let b = hi;
  for (let i = 0; i < BISECT_STEPS; i++) {
    const m = (a + b) / 2;
    if (grid.sampleLinear(add(origin, scale(dir, m))) - offset <= 0) b = m;
    else a = m;
  }
  return b;
}

/** Marches along a ray until sdf(p) <= offset; returns the distance or null. */
function march(
  grid: SdfQuery,
  origin: Vec3,
  dir: Vec3,
  maxDistance: number,
  offset: number,
): number | null {
  const minStep = grid.cellSize * 0.25;
  let t = 0;
  let prev = 0;
  for (let i = 0; i < MAX_STEPS; i++) {
    const d = grid.sampleLinear(add(origin, scale(dir, t))) - offset;
    if (d <= 0) return t === 0 ? 0 : bisect(grid, origin, dir, prev, t, offset);
    prev = t;
    t += Math.max(d, minStep);
    if (t > maxDistance) {
      const end = grid.sampleLinear(add(origin, scale(dir, maxDistance))) - offset;
      return end <= 0 ? bisect(grid, origin, dir, prev, maxDistance, offset) : null;
    }
  }
  return null;
}

/**
 * Sphere-traces a ray against the terrain. Starting inside solid returns a hit at
 * distance 0. Returns null when nothing is hit within maxDistance.
 */
export function rayCast(
  grid: SdfQuery,
  origin: Vec3,
  direction: Vec3,
  maxDistance: number,
): RayHit | null {
  const dir = normalize(direction);
  const t = march(grid, origin, dir, maxDistance, 0);
  if (t === null) return null;
  const point = add(origin, scale(dir, t));
  return { point, normal: grid.normal(point), distance: t };
}

/** Finds the first contact of a sphere moving from `from` to `to`. */
export function sphereSweep(grid: SdfQuery, from: Vec3, to: Vec3, radius: number): SweepHit | null {
  const len = distance(from, to);
  if (len === 0) {
    if (grid.sampleLinear(from) > radius) return null;
    return { point: from, normal: grid.normal(from), t: 0 };
  }
  const dir = scale(sub(to, from), 1 / len);
  const d = march(grid, from, dir, len, radius);
  if (d === null) return null;
  const point = add(from, scale(dir, d));
  return { point, normal: grid.normal(point), t: Math.min(1, d / len) };
}

/** Surface normal at p. */
export function groundNormal(grid: SdfQuery, p: Vec3): Vec3 {
  return grid.normal(p);
}

/** Casts straight down from p up to maxDrop; returns the ground contact or null. */
export function findGround(
  grid: SdfQuery,
  p: Vec3,
  maxDrop: number,
): { point: Vec3; normal: Vec3 } | null {
  const hit = rayCast(grid, p, { x: 0, y: -1, z: 0 }, maxDrop);
  return hit ? { point: hit.point, normal: hit.normal } : null;
}

/** True when a sphere at centre overlaps terrain. */
export function isSphereColliding(grid: SdfQuery, centre: Vec3, radius: number): boolean {
  return grid.sampleLinear(centre) <= radius;
}
