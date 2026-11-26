/** Hermite smoothstep of `v` between edges `a` and `b`, clamped to [0, 1]. */
export const smoothstep = (a: number, b: number, v: number): number => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Map edge of the original arena (cells); features are laid out for this size and repeated beyond. */
const BASE_EDGE = 96;

/**
 * How many extra features a bigger map gets: `perDoubling` per doubling of the shorter side over
 * the original 96 cells, rounded. Zero at the original size, so small maps are unchanged.
 */
export const extraFeatures = (nx: number, nz: number, perDoubling: number): number =>
  Math.max(0, Math.round((Math.min(nx, nz) / BASE_EDGE - 1) * perDoubling));
