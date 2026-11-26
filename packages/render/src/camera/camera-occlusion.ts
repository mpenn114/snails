import { clamp } from './damping.js';
import type { CameraPose, Point3 } from './camera-pose.js';

/** Signed distance to terrain at a point; negative inside rock. */
export type SdfSampler = (x: number, y: number, z: number) => number;

/** Tunables for {@link resolveOcclusion}. */
export interface OcclusionOptions {
  /** Keep the camera at least this far (m) from rock. */
  clearance?: number;
  /** Never pull the camera closer to the target than this (m). */
  minDistance?: number;
  /** Largest pitch increase (radians) tried before the camera is pulled in. */
  maxRaise?: number;
  /** Highest pitch the raise may reach. */
  maxPitch?: number;
  /** Ray-march step (m). */
  step?: number;
}

/** Result of {@link resolveOcclusion}. */
export interface OcclusionResult {
  pose: CameraPose;
  /** True when the camera had to be pulled in noticeably: the target sits in a tight space. */
  enclosed: boolean;
}

const DEFAULTS = { clearance: 0.7, minDistance: 0.9, maxRaise: 0.7, maxPitch: 1.45, step: 0.3 };

/** Distance along `dir` from `from` before the SDF drops below `clearance`, or `max` if free. */
export function freeDistance(
  sdf: SdfSampler,
  from: Point3,
  dir: Point3,
  max: number,
  clearance: number,
  step: number,
): number {
  let last = 0;
  for (let t = step; ; t += step) {
    const d = Math.min(t, max);
    if (sdf(from.x + dir.x * d, from.y + dir.y * d, from.z + dir.z * d) < clearance) return last;
    last = d;
    if (d >= max) return max;
  }
}

function offsetDir(yaw: number, pitch: number): Point3 {
  const h = Math.cos(pitch);
  return { x: Math.cos(yaw) * h, y: Math.sin(pitch), z: Math.sin(yaw) * h };
}

/**
 * Keeps an orbit camera out of rock. If terrain lies between the target and the camera it first
 * tries raising the pitch (looking down over the obstacle); when no raised pitch clears the full
 * distance it uses the pitch with the most room and pulls the camera in along that line.
 */
export function resolveOcclusion(
  pose: CameraPose,
  sdf: SdfSampler,
  options: OcclusionOptions = {},
): OcclusionResult {
  const o = { ...DEFAULTS, ...options };
  const full = pose.distance;
  const minD = Math.min(o.minDistance, full);
  const raiseTo = Math.max(pose.pitch, Math.min(o.maxPitch, pose.pitch + o.maxRaise));
  let bestPitch = pose.pitch;
  let bestDist = -1;
  const steps = 5;
  for (let i = 0; i <= steps; i++) {
    const pitch = pose.pitch + ((raiseTo - pose.pitch) * i) / steps;
    const d = freeDistance(sdf, pose.target, offsetDir(pose.yaw, pitch), full, o.clearance, o.step);
    if (d > bestDist + 1e-6) {
      bestDist = d;
      bestPitch = pitch;
    }
    if (d >= full) break;
  }
  const distance = clamp(bestDist, minD, full);
  return {
    pose: { target: { ...pose.target }, yaw: pose.yaw, pitch: bestPitch, distance },
    enclosed: distance < full * 0.75,
  };
}

/**
 * Last-resort guard for the final camera position: when it lies inside rock, slides it back
 * along the line to the target to the last free point. A target that is itself in rock is left
 * alone.
 */
export function pullOutOfRock(
  target: Point3,
  pos: Point3,
  sdf: SdfSampler,
  clearance = 0.3,
  step = 0.25,
): Point3 {
  if (sdf(pos.x, pos.y, pos.z) >= clearance || sdf(target.x, target.y, target.z) < 0) return pos;
  const dx = pos.x - target.x;
  const dy = pos.y - target.y;
  const dz = pos.z - target.z;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-6) return pos;
  const dir = { x: dx / len, y: dy / len, z: dz / len };
  const d = freeDistance(sdf, target, dir, len, clearance, step);
  return { x: target.x + dir.x * d, y: target.y + dir.y * d, z: target.z + dir.z * d };
}

/**
 * Snail-eye pose: the camera sits just ahead of the snail's eyes at (almost) its own height
 * looking along its facing. Expressed as an orbit pose whose target is `lookAhead` metres ahead.
 */
export function eyePose(point: Point3, yaw: number, lookAhead = 3, eyeForward = 0.5): CameraPose {
  const distance = lookAhead - eyeForward;
  const pitch = 0.02;
  return {
    target: {
      x: point.x - Math.cos(yaw) * lookAhead,
      y: point.y - Math.sin(pitch) * distance,
      z: point.z - Math.sin(yaw) * lookAhead,
    },
    yaw,
    pitch,
    distance,
  };
}
