/** Horizontal move intent. */
export type MoveDirection = 'left' | 'right' | 'stop';

/** Clamps a thumb vector to a circle of `radius`; returns the knob offset to draw. */
export function clampKnob(dx: number, dy: number, radius: number): { x: number; y: number } {
  const len = Math.hypot(dx, dy);
  if (len <= radius || len === 0) return { x: dx, y: dy };
  const k = radius / len;
  return { x: dx * k, y: dy * k };
}

/** Wraps `emit` so it only fires when the value differs from the last emitted one. */
export function onChange<T>(emit: (v: T) => void, initial: T): (v: T) => void {
  let last = initial;
  return (v) => {
    if (v === last) return;
    last = v;
    emit(v);
  };
}
