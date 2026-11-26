import type { Rng } from '../../rng.js';

/** A point in metres. */
export interface Pt {
  x: number;
  y: number;
  z: number;
}

/** A prepared tunnel: a chain of capsules with per-segment bounding boxes (all in metres). */
export interface Tunnel {
  /** Tunnel radius (m). */
  radius: number;
  /** The centre line. */
  points: readonly Pt[];
  /** Per segment: minX, minY, minZ, maxX, maxY, maxZ (already grown by the radius). */
  boxes: Float64Array;
  /** Whole tunnel: minX, minY, minZ, maxX, maxY, maxZ (the union of {@link boxes}). */
  bounds: Float64Array;
}

/** Options for {@link wobblyPath}. */
export interface WobbleOptions {
  /** Number of segments (default 8). */
  segments?: number;
  /** Maximum sideways drift (m, default 1.5); tapers to zero at both ends. */
  sideways?: number;
  /** Maximum vertical drift (m, default 0.6); tapers to zero at both ends. */
  vertical?: number;
}

/** Builds a tunnel of the given radius (m) along a polyline of at least two points (m). */
export function buildTunnel(points: readonly Pt[], radius: number): Tunnel {
  const boxes = new Float64Array(Math.max(0, points.length - 1) * 6);
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i] as Pt;
    const b = points[i + 1] as Pt;
    boxes.set(
      [
        Math.min(a.x, b.x) - radius,
        Math.min(a.y, b.y) - radius,
        Math.min(a.z, b.z) - radius,
        Math.max(a.x, b.x) + radius,
        Math.max(a.y, b.y) + radius,
        Math.max(a.z, b.z) + radius,
      ],
      i * 6,
    );
  }
  const bounds = new Float64Array([Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]);
  for (let i = 0; i < boxes.length; i++) {
    const k = i % 6;
    const v = boxes[i] as number;
    bounds[k] = k < 3 ? Math.min(bounds[k] as number, v) : Math.max(bounds[k] as number, v);
  }
  return { radius, points, boxes, bounds };
}

/** Distance (m) from point p to the segment a-b. */
export function segmentDistance(a: Pt, b: Pt, px: number, py: number, pz: number): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abz = b.z - a.z;
  const len2 = abx * abx + aby * aby + abz * abz;
  const t =
    len2 > 0
      ? Math.max(0, Math.min(1, ((px - a.x) * abx + (py - a.y) * aby + (pz - a.z) * abz) / len2))
      : 0;
  return Math.hypot(px - (a.x + abx * t), py - (a.y + aby * t), pz - (a.z + abz * t));
}

/**
 * Carve value (m, positive = void) of a tunnel at point (x, y, z) in metres: the radius minus the
 * distance to the centre line, or `-Infinity` when the point is outside every segment's
 * bounding box (cheap early-out for the vast majority of cells).
 */
export function tunnelCarve(t: Tunnel, x: number, y: number, z: number): number {
  const u = t.bounds;
  if (x < (u[0] as number) || y < (u[1] as number) || z < (u[2] as number)) return -Infinity;
  if (x > (u[3] as number) || y > (u[4] as number) || z > (u[5] as number)) return -Infinity;
  const b = t.boxes;
  let best = -Infinity;
  for (let i = 0, n = b.length; i < n; i += 6) {
    if (
      x < (b[i] as number) ||
      x > (b[i + 3] as number) ||
      y < (b[i + 1] as number) ||
      y > (b[i + 4] as number) ||
      z < (b[i + 2] as number) ||
      z > (b[i + 5] as number)
    ) {
      continue;
    }
    const s = i / 6;
    const d = segmentDistance(t.points[s] as Pt, t.points[s + 1] as Pt, x, y, z);
    if (t.radius - d > best) best = t.radius - d;
  }
  return best;
}

/**
 * A wobbly centre line from `a` to `b` (metres): the straight line with smooth sideways and
 * vertical drift drawn from `rng`, exactly hitting both endpoints.
 */
export function wobblyPath(rng: Rng, a: Pt, b: Pt, opts: WobbleOptions = {}): Pt[] {
  const n = opts.segments ?? 8;
  const side = opts.sideways ?? 1.5;
  const vert = opts.vertical ?? 0.6;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dz) || 1;
  const px = -dz / len;
  const pz = dx / len;
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const taper = Math.sin(Math.PI * t);
    const s = i === 0 || i === n ? 0 : rng.range(-side, side) * taper;
    const v = i === 0 || i === n ? 0 : rng.range(-vert, vert) * taper;
    out.push({
      x: a.x + dx * t + px * s,
      y: a.y + (b.y - a.y) * t + v,
      z: a.z + dz * t + pz * s,
    });
  }
  return out;
}
