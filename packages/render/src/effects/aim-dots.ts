/** A point in metres. */
export interface DotPoint {
  x: number;
  y: number;
  z: number;
}

/** Result of {@link layoutDots}. */
export interface DotLayout {
  /** Dots written to the output array. */
  count: number;
  /** Where the arc first enters solid terrain, or null when it never does. */
  impact: DotPoint | null;
  /** Length of the visible arc in metres. */
  length: number;
}

/** Bisection steps used to locate the terrain entry inside a segment. */
const REFINE_STEPS = 8;

/**
 * Walks the polyline `points` and writes evenly spaced dots (x, y, z, u per dot into `out`, u in
 * 0..1 along the visible arc). The arc ends at the first sample inside solid terrain, refined by
 * bisection, which becomes `impact`. `phase` in [0, spacing) shifts the dots along the arc so
 * they can march. Dots closer than `skip` metres to the start are omitted (they would sit on
 * the snail). Pure; `out` must hold at least `maxDots * 4` floats.
 */
export function layoutDots(
  points: readonly DotPoint[],
  spacing: number,
  phase: number,
  skip: number,
  maxDots: number,
  out: Float32Array,
  isSolid?: (p: DotPoint) => boolean,
): DotLayout {
  const segs: number[] = [];
  let impact: DotPoint | null = null;
  let end = points.length > 0 ? points[points.length - 1] : undefined;
  for (let i = 1; i < points.length && !impact; i++) {
    const a = points[i - 1] as DotPoint;
    let b = points[i] as DotPoint;
    if (isSolid?.(b)) {
      b = bisect(a, b, isSolid);
      impact = b;
      end = b;
    }
    segs.push(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z));
  }
  const length = segs.reduce((s, v) => s + v, 0);
  if (!end || length <= 0) return { count: 0, impact, length: 0 };
  let count = 0;
  let dist = 0;
  let next = Math.max(skip, phase);
  for (let i = 0; i < segs.length && count < maxDots; i++) {
    const len = segs[i] as number;
    const a = points[i] as DotPoint;
    const b = i === segs.length - 1 ? end : (points[i + 1] as DotPoint);
    while (next <= dist + len && count < maxDots) {
      const f = len > 0 ? (next - dist) / len : 0;
      const k = count * 4;
      out[k] = a.x + (b.x - a.x) * f;
      out[k + 1] = a.y + (b.y - a.y) * f;
      out[k + 2] = a.z + (b.z - a.z) * f;
      out[k + 3] = next / length;
      count++;
      next += spacing;
    }
    dist += len;
  }
  return { count, impact, length };
}

/** Finds the point where segment a-b first becomes solid (a is open air, b is solid). */
function bisect(a: DotPoint, b: DotPoint, isSolid: (p: DotPoint) => boolean): DotPoint {
  let lo = 0;
  let hi = 1;
  const p: DotPoint = { x: b.x, y: b.y, z: b.z };
  for (let i = 0; i < REFINE_STEPS; i++) {
    const m = (lo + hi) / 2;
    p.x = a.x + (b.x - a.x) * m;
    p.y = a.y + (b.y - a.y) * m;
    p.z = a.z + (b.z - a.z) * m;
    if (isSolid(p)) hi = m;
    else lo = m;
  }
  return {
    x: a.x + (b.x - a.x) * hi,
    y: a.y + (b.y - a.y) * hi,
    z: a.z + (b.z - a.z) * hi,
  };
}

/** Dot radius in metres at fraction `u` along the arc: small near the snail, larger towards the target. */
export function dotRadius(u: number): number {
  return 0.07 + 0.06 * Math.min(1, Math.max(0, u));
}
