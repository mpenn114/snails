import * as THREE from 'three';

/** Largest tilt of a snail away from upright, in radians (50 degrees). */
export const MAX_TILT = (50 * Math.PI) / 180;
/** Exponential damping rate (1/s) of the tilt; about 0.15 s to settle. */
export const TILT_RATE = 9;
/** Radius (m) of the ring of extra samples around the foot. */
export const TILT_SAMPLE_RADIUS = 0.3;

/** A point or direction in world space. */
export interface TiltVec {
  x: number;
  y: number;
  z: number;
}

/** Anything that returns a unit surface normal (towards air) at a world point. */
export type NormalSampler = (p: TiltVec) => TiltVec;

const UP = new THREE.Vector3(0, 1, 0);

/**
 * Smoothed ground normal under a foot: the unit-length average of the normal at the foot and at
 * four points on a ring around it. Falls back to straight up when the samples cancel or vanish.
 */
export function groundNormalAt(
  sample: NormalSampler,
  p: TiltVec,
  radius = TILT_SAMPLE_RADIUS,
): THREE.Vector3 {
  const sum = new THREE.Vector3();
  const offsets: [number, number][] = [
    [0, 0],
    [radius, 0],
    [-radius, 0],
    [0, radius],
    [0, -radius],
  ];
  for (const [dx, dz] of offsets) {
    const n = sample({ x: p.x + dx, y: p.y, z: p.z + dz });
    sum.add(new THREE.Vector3(n.x, n.y, n.z));
  }
  return sum.lengthSq() < 1e-9 ? UP.clone() : sum.normalize();
}

/** Rotation taking +Y to `normal`, with the angle from upright clamped to `maxTilt`. */
export function tiltQuaternion(
  normal: TiltVec | null,
  maxTilt = MAX_TILT,
  out = new THREE.Quaternion(),
): THREE.Quaternion {
  if (!normal) return out.identity();
  const n = new THREE.Vector3(normal.x, normal.y, normal.z);
  if (n.lengthSq() < 1e-12) return out.identity();
  n.normalize();
  const angle = Math.acos(Math.min(1, Math.max(-1, n.y)));
  if (angle < 1e-6) return out.identity();
  if (angle > maxTilt) {
    const axis = new THREE.Vector3().crossVectors(UP, n).normalize();
    return out.setFromAxisAngle(axis, maxTilt);
  }
  return out.setFromUnitVectors(UP, n);
}

/** Frame-rate independent step of `current` towards `target` (in place); returns `current`. */
export function dampTilt(
  current: THREE.Quaternion,
  target: THREE.Quaternion,
  dt: number,
  rate = TILT_RATE,
): THREE.Quaternion {
  if (dt <= 0) return current;
  return current.slerp(target, 1 - Math.exp(-rate * dt));
}
