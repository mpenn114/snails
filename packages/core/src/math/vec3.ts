import type { Vec3 } from '../state/types.js';

/** Returns a + b. */
export function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

/** Returns a - b. */
export function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

/** Returns v * s. */
export function scale(v: Vec3, s: number): Vec3 {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

/** Returns the dot product of a and b. */
export function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

/** Returns the Euclidean length of v. */
export function length(v: Vec3): number {
  return Math.hypot(v.x, v.y, v.z);
}

/** Returns v scaled to unit length; the zero vector is returned unchanged. */
export function normalize(v: Vec3): Vec3 {
  const l = length(v);
  return l > 0 ? scale(v, 1 / l) : { x: v.x, y: v.y, z: v.z };
}

/** Returns the distance between a and b. */
export function distance(a: Vec3, b: Vec3): number {
  return length(sub(a, b));
}
