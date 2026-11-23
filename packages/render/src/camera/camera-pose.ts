import { clamp } from './damping.js';

/** A point in world space. */
export interface Point3 {
  x: number;
  y: number;
  z: number;
}

/** Orbit-style camera pose: look-at point plus spherical offset. Radians and metres, +Y up. */
export interface CameraPose {
  target: Point3;
  /** Azimuth of the camera relative to the target: offset = (cos yaw, ., sin yaw). */
  yaw: number;
  /** Elevation above the horizontal plane. */
  pitch: number;
  distance: number;
}

/** Axis-aligned world box. */
export interface WorldBounds {
  min: Point3;
  max: Point3;
}

/** Pitch/distance limits. */
export interface PoseLimits {
  minPitch: number;
  maxPitch: number;
  minDistance: number;
  maxDistance: number;
}

/** Copies a pose. */
export function clonePose(p: CameraPose): CameraPose {
  return { target: { ...p.target }, yaw: p.yaw, pitch: p.pitch, distance: p.distance };
}

/** Camera world position for a pose. */
export function poseToPosition(p: CameraPose): Point3 {
  const horizontal = Math.cos(p.pitch) * p.distance;
  return {
    x: p.target.x + Math.cos(p.yaw) * horizontal,
    y: p.target.y + Math.sin(p.pitch) * p.distance,
    z: p.target.z + Math.sin(p.yaw) * horizontal,
  };
}

/** Yaw that places the camera behind something facing `facing` (0 = +X, π/2 = -Z). */
export function yawBehindFacing(facing: number): number {
  return Math.PI - facing;
}

/** Facing angle of a horizontal velocity, or null when it is nearly vertical/still. */
export function facingFromVelocity(vx: number, vz: number): number | null {
  return Math.hypot(vx, vz) < 0.5 ? null : Math.atan2(-vz, vx);
}

/** Clamps pitch and distance in place. */
export function clampPose(p: CameraPose, limits: PoseLimits): void {
  p.pitch = clamp(p.pitch, limits.minPitch, limits.maxPitch);
  p.distance = clamp(p.distance, limits.minDistance, limits.maxDistance);
}

/** Clamps a point into bounds (in place) and returns it. */
export function clampPoint(pt: Point3, b: WorldBounds): Point3 {
  pt.x = clamp(pt.x, b.min.x, b.max.x);
  pt.y = clamp(pt.y, b.min.y, b.max.y);
  pt.z = clamp(pt.z, b.min.z, b.max.z);
  return pt;
}

/** Bounds for a terrain descriptor (origin at 0) with headroom above for the camera. */
export function boundsFromTerrain(
  t: { nx: number; ny: number; nz: number; cellSize: number },
  margin: number,
): WorldBounds {
  return {
    min: { x: -margin, y: 0, z: -margin },
    max: {
      x: t.nx * t.cellSize + margin,
      y: t.ny * t.cellSize + margin * 2,
      z: t.nz * t.cellSize + margin,
    },
  };
}
