/** Scalar spring state for critically-damped smoothing. */
export interface DampState {
  value: number;
  velocity: number;
}

/**
 * Advances a critically-damped spring toward `target` using the exact closed-form solution, so
 * the result is independent of how `dt` is subdivided (for a constant target).
 * `smoothTime` is roughly the seconds to reach the target; must be > 0.
 */
export function dampStep(state: DampState, target: number, smoothTime: number, dt: number): void {
  if (dt <= 0) return;
  const omega = 2 / Math.max(smoothTime, 1e-4);
  const c1 = state.value - target;
  const c2 = state.velocity + omega * c1;
  const decay = Math.exp(-omega * dt);
  state.value = target + (c1 + c2 * dt) * decay;
  state.velocity = (c2 - omega * (c1 + c2 * dt)) * decay;
}

/** Wraps `angle` by multiples of 2π so it lies within π of `reference`. */
export function unwrapAngle(angle: number, reference: number): number {
  const turn = Math.PI * 2;
  return angle + turn * Math.round((reference - angle) / turn);
}

/** Clamps `v` into [lo, hi]. */
export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
