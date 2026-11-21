import type { Vec3, Wind } from '../state/types.js';

/** Fixed simulation timestep in seconds (60 Hz). */
export const FIXED_DT = 1 / 60;
/** Gravity magnitude in m/s^2, applied along -Y. */
export const GRAVITY = 9.81;
/**
 * Scale from `Wind.strength` to acceleration in m/s^2. Strength is already expressed in
 * m/s^2, so this is 1; tune it here to rebalance wind globally.
 */
export const WIND_ACCEL_SCALE = 1;

/** Position and velocity of a projectile, with optional per-weapon scales (default 1). */
export interface ProjectileState {
  position: Vec3;
  velocity: Vec3;
  gravityScale?: number;
  windScale?: number;
}

/**
 * Horizontal wind acceleration in m/s^2. Same convention as snail facing (`facingVector`):
 * `direction` is a rotation about +Y, so the result is `{ x: cos d, y: 0, z: -sin d }`. Direction
 * 0 blows along +X and PI/2 along -Z.
 */
export function windAcceleration(wind: Wind): Vec3 {
  const a = wind.strength * WIND_ACCEL_SCALE;
  return { x: a * Math.cos(wind.direction), y: 0, z: -a * Math.sin(wind.direction) };
}

/**
 * Advances a projectile by one step using semi-implicit Euler (velocity first, then position).
 * Pure and deterministic.
 * @param p - Current state (not mutated).
 * @param wind - Current wind.
 * @param dt - Timestep in seconds.
 */
export function stepProjectile(p: ProjectileState, wind: Wind, dt = FIXED_DT): ProjectileState {
  const g = GRAVITY * (p.gravityScale ?? 1);
  const w = windAcceleration(wind);
  const ws = p.windScale ?? 1;
  const velocity = {
    x: p.velocity.x + w.x * ws * dt,
    y: p.velocity.y - g * dt,
    z: p.velocity.z + w.z * ws * dt,
  };
  const position = {
    x: p.position.x + velocity.x * dt,
    y: p.position.y + velocity.y * dt,
    z: p.position.z + velocity.z * dt,
  };
  return { ...p, position, velocity };
}
