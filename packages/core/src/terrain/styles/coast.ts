import { smoothstep } from './shared.js';

/** A sea stack: a tall, irregular rock pillar standing in the water. Lengths in cells unless noted. */
export interface Stack {
  x: number;
  z: number;
  /** Base radius (cells). */
  r: number;
  /** Absolute world height of the top (m). */
  top: number;
  /** Horizontal lean (cells per metre of height). */
  leanX: number;
  leanZ: number;
  /** Phases (radians) of the wobble of the outline. */
  phase1: number;
  phase2: number;
  /** Heights above the water (m) where the pillar steps in (ledges). */
  ledge1: number;
  ledge2: number;
}

/** A natural rock arch: a bent torus segment, both feet in the water or on the shore. Metres. */
export interface Arch {
  /** Centre of the ring on the water surface. */
  x: number;
  z: number;
  /** Unit direction of the arch's span in the x/z plane. */
  ux: number;
  uz: number;
  /** Ring radius (m), tube radius (m) and the height of the ring centre (m). */
  ring: number;
  tube: number;
  y0: number;
  phase: number;
}

/** Signed distance (m, negative inside) to an irregular, tapering, leaning pillar. */
export function stackDistance(s: Stack, cs: number, x: number, y: number, z: number): number {
  const reach = s.r * 1.7 + 0.1 * s.top;
  if (Math.abs(x - s.x) > reach || Math.abs(z - s.z) > reach) return 1e3;
  const yy = y * cs;
  const t = Math.min(1, Math.max(0, (yy - 2) / (s.top - 2)));
  const cx = s.x + s.leanX * yy;
  const cz = s.z + s.leanZ * yy;
  const dx = x - cx;
  const dz = z - cz;
  const ang = Math.atan2(dz, dx);
  const wob =
    1 + 0.16 * Math.sin(3 * ang + s.phase1 + yy * 0.35) + 0.09 * Math.sin(5 * ang + s.phase2);
  const l1 = 1 - 0.3 * smoothstep(s.ledge1 - 0.4, s.ledge1 + 0.4, yy);
  const l2 = 1 - 0.22 * smoothstep(s.ledge2 - 0.4, s.ledge2 + 0.4, yy);
  const rad = s.r * (1 - 0.35 * t) * wob * l1 * l2;
  const side = (Math.hypot(dx, dz) - rad) * cs;
  // Rounded, slightly sloping top.
  return Math.max(side, yy - s.top + 0.6 * smoothstep(0, 1, Math.hypot(dx, dz) / (rad + 1e-6)));
}

/** Signed distance (m, negative inside) to the arch: a warped torus half, cut below the sea floor. */
export function archDistance(a: Arch, cs: number, x: number, y: number, z: number): number {
  const dx = x * cs - a.x;
  const dz = z * cs - a.z;
  const reach = a.ring + a.tube * 2 + 3;
  if (Math.abs(dx) > reach || Math.abs(dz) > reach) return 1e3;
  const u = dx * a.ux + dz * a.uz;
  // Bend the span sideways and thicken/thin the tube along it.
  const v = -dx * a.uz + dz * a.ux - 0.9 * Math.sin(u * 0.45 + a.phase);
  const yy = y * cs - a.y0;
  const tube = a.tube * (1 + 0.22 * Math.sin(u * 1.1 + a.phase * 2) * Math.cos(yy * 0.9));
  const d = Math.hypot(Math.hypot(u, yy) - a.ring, v) - tube;
  return Math.max(d, -(yy + 1.6));
}

/** True when the cell lies close to a stack or the arch (for rock material). */
export function nearRock(
  stacks: readonly Stack[],
  arch: Arch,
  cs: number,
  x: number,
  y: number,
  z: number,
): boolean {
  for (const s of stacks) if (stackDistance(s, cs, x, y, z) < 1.5) return true;
  return archDistance(arch, cs, x, y, z) < 1.2;
}
