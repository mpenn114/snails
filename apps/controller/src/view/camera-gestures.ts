import type { FreeCameraInput } from '@snails/render';

/** Gesture tuning. */
export interface GestureOptions {
  /** Radians of orbit per pixel dragged. */
  radiansPerPixel: number;
  /** Pan metres per pixel per metre of camera distance. */
  panPerPixelPerMetre: number;
}

const DEFAULTS: GestureOptions = { radiansPerPixel: 0.006, panPerPixelPerMetre: 0.0015 };

/** Orbit input for a one-finger drag. */
export function orbitFromDrag(dx: number, dy: number, o: GestureOptions): FreeCameraInput {
  return { orbitDelta: { x: -dx * o.radiansPerPixel, y: dy * o.radiansPerPixel } };
}

/** Zoom input for a pinch: fingers apart (span grows) zooms in, so the distance shrinks. */
export function zoomFromPinch(prevSpan: number, span: number): number {
  return prevSpan > 0 && span > 0 ? Math.log(prevSpan / span) : 0;
}

/** Pan input for a two-finger centroid drag at a given camera distance. */
export function panFromDrag(
  dx: number,
  dy: number,
  distance: number,
  o: GestureOptions,
): FreeCameraInput {
  const k = o.panPerPixelPerMetre * distance;
  return { panDelta: { x: -dx * k, y: dy * k } };
}

interface Pt {
  x: number;
  y: number;
}

interface Pair {
  cx: number;
  cy: number;
  span: number;
}

/**
 * Tracks pointers and converts moves into free-camera input: one pointer orbits, two pointers
 * pinch-zoom and pan. Pure; the DOM layer just forwards pointer events.
 */
export class GestureTracker {
  private readonly pts = new Map<number, Pt>();
  private readonly o: GestureOptions;

  constructor(
    private readonly getDistance: () => number,
    opts: Partial<GestureOptions> = {},
  ) {
    this.o = { ...DEFAULTS, ...opts };
  }

  /** Number of pointers currently down. */
  get active(): number {
    return this.pts.size;
  }

  /** Registers a pointer. */
  down(id: number, x: number, y: number): void {
    this.pts.set(id, { x, y });
  }

  /** Releases a pointer. */
  up(id: number): void {
    this.pts.delete(id);
  }

  /** Moves a pointer; returns the resulting camera input, or null if nothing applies. */
  move(id: number, x: number, y: number): FreeCameraInput | null {
    const prev = this.pts.get(id);
    if (!prev) return null;
    const before = this.pair();
    this.pts.set(id, { x, y });
    if (this.pts.size === 1) return orbitFromDrag(x - prev.x, y - prev.y, this.o);
    if (this.pts.size !== 2) return null;
    const after = this.pair();
    return {
      zoomDelta: zoomFromPinch(before.span, after.span),
      ...panFromDrag(after.cx - before.cx, after.cy - before.cy, this.getDistance(), this.o),
    };
  }

  private pair(): Pair {
    const [a, b] = [...this.pts.values()];
    if (!a || !b) return { cx: 0, cy: 0, span: 0 };
    return { cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, span: Math.hypot(a.x - b.x, a.y - b.y) };
  }
}
