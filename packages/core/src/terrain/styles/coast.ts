/** A sea stack: a tall rock pillar standing in the water, in cell units (x, z, radius) and metres (top). */
export interface Stack {
  x: number;
  z: number;
  /** Base radius in cells. */
  r: number;
  /** Absolute world height of the top (m). */
  top: number;
}

/** A natural rock arch: a thin rock wall pierced by an opening above the water. */
export interface Arch {
  x: number;
  z: number;
  /** Unit direction of the wall's length in the x/z plane. */
  ux: number;
  uz: number;
  /** Half length and half thickness of the wall (cells). */
  halfLen: number;
  halfThick: number;
  /** Absolute world height of the wall top (m). */
  top: number;
  /** Opening centre height (m), half width (cells) and half height (m). */
  openY: number;
  openW: number;
  openH: number;
}

/** Signed distance (m, negative inside) to a tapering pillar. */
export function stackDistance(s: Stack, cs: number, x: number, y: number, z: number): number {
  const yy = y * cs;
  const taper = 1 - 0.45 * Math.min(1, Math.max(0, (yy - 2) / (s.top - 2)));
  const side = (Math.hypot(x - s.x, z - s.z) - s.r * taper) * cs;
  return Math.max(side, yy - s.top);
}

/** Wall-local coordinates (cells): along the wall `u` and across it `v`. */
function archLocal(a: Arch, x: number, z: number): { u: number; v: number } {
  const dx = x - a.x;
  const dz = z - a.z;
  return { u: dx * a.ux + dz * a.uz, v: -dx * a.uz + dz * a.ux };
}

/** Signed distance (m) to the arch's solid wall, before the opening is cut. */
export function archWallDistance(a: Arch, cs: number, x: number, y: number, z: number): number {
  const { u, v } = archLocal(a, x, z);
  const side = Math.max(Math.abs(u) - a.halfLen, Math.abs(v) - a.halfThick) * cs;
  return Math.max(side, y * cs - a.top);
}

/** Carve value (m, positive = void) of the arch opening; `-Infinity` away from the arch. */
export function archCarve(a: Arch, cs: number, x: number, y: number, z: number): number {
  const { u, v } = archLocal(a, x, z);
  if (Math.abs(v) > a.halfThick + 2 || Math.abs(u) > a.halfLen) return -Infinity;
  const e = Math.hypot(u / a.openW, (y * cs - a.openY) / a.openH);
  return (1 - e) * Math.min(a.openW * cs, a.openH);
}

/** True when the cell lies within 1.5 m of a stack or the arch wall (for rock material). */
export function nearRock(
  stacks: readonly Stack[],
  arch: Arch,
  cs: number,
  x: number,
  y: number,
  z: number,
): boolean {
  for (const s of stacks) if (stackDistance(s, cs, x, y, z) < 1.5) return true;
  return archWallDistance(arch, cs, x, y, z) < 1.5;
}
