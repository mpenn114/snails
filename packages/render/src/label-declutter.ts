/** A label to place, in normalised screen units (any consistent 2D unit works). */
export interface LabelBox {
  id: string;
  /** Centre x. */
  x: number;
  /** Centre y (up is positive). */
  y: number;
  width: number;
  height: number;
  /** Distance from the camera; nearer labels win. */
  distance: number;
}

/** Placement decision for one label. */
export interface LabelPlacement {
  id: string;
  /** True when no non-overlapping position was found. */
  hidden: boolean;
  /** Upward shift (screen units) applied to avoid overlaps; 0 when unmoved. */
  offsetY: number;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function overlaps(a: LabelBox, y: number, b: Rect): boolean {
  return Math.abs(a.x - b.x) * 2 < a.width + b.w && Math.abs(y - b.y) * 2 < a.height + b.h;
}

/**
 * Greedy label declutter: labels are processed nearest first; each is shifted up in steps of
 * its own height (at most `maxSteps`) until it clears all placed labels, else hidden.
 * Pure; output order follows the input order.
 */
export function declutterLabels(boxes: readonly LabelBox[], maxSteps = 3): LabelPlacement[] {
  const order = [...boxes].sort((a, b) => a.distance - b.distance);
  const placed: Rect[] = [];
  const out = new Map<string, LabelPlacement>();
  for (const box of order) {
    let result: LabelPlacement = { id: box.id, hidden: true, offsetY: 0 };
    for (let step = 0; step <= maxSteps; step++) {
      const y = box.y + step * box.height;
      if (placed.some((p) => overlaps(box, y, p))) continue;
      placed.push({ x: box.x, y, w: box.width, h: box.height });
      result = { id: box.id, hidden: false, offsetY: step * box.height };
      break;
    }
    out.set(box.id, result);
  }
  return boxes.map((b) => out.get(b.id)!);
}
