import type { Vec3 } from '../state/types.js';

/** Fixed simulation timestep in seconds (60 Hz). */
export const FIXED_DT = 1 / 60;
/** Gravity acceleration (world units / s^2, along -y). */
export const GRAVITY = 9.81;

/** Position and velocity of a projectile. */
export interface ProjectileState {
  position: Vec3;
  velocity: Vec3;
}

/**
 * Advances a projectile by one fixed step using semi-implicit Euler integration.
 * @param p - Current state (not mutated).
 * @param wind - Horizontal wind acceleration along +x.
 * @param dt - Timestep in seconds.
 */
export function stepProjectile(p: ProjectileState, wind: number, dt = FIXED_DT): ProjectileState {
  const velocity = { x: p.velocity.x + wind * dt, y: p.velocity.y - GRAVITY * dt, z: p.velocity.z };
  const position = {
    x: p.position.x + velocity.x * dt,
    y: p.position.y + velocity.y * dt,
    z: p.position.z + velocity.z * dt,
  };
  return { position, velocity };
}
