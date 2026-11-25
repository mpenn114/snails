/** Hermite smoothstep of `v` between edges `a` and `b`, clamped to [0, 1]. */
export const smoothstep = (a: number, b: number, v: number): number => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
