/** Horizontal move intent. */
export type MoveDirection = 'left' | 'right' | 'stop';

/**
 * Maps horizontal thumb deflection (px, +right) to a move intent with hysteresis: engaging needs
 * `deadzone` px, releasing back to stop needs the deflection to fall below `deadzone * 0.6`.
 */
export function joystickDirection(
  dx: number,
  deadzone: number,
  previous: MoveDirection = 'stop',
): MoveDirection {
  const threshold = previous === 'stop' ? deadzone : deadzone * 0.6;
  if (Math.abs(dx) < threshold) return 'stop';
  return dx < 0 ? 'left' : 'right';
}

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
