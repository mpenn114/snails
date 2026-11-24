import { GRAVITY } from '../physics/ballistics.js';

/** Tunable snail movement parameters (metres, seconds, radians). */
export interface MovementConfig {
  /** Crawl speed along the surface in m/s. */
  crawlSpeed: number;
  /** Steepest climbable slope: angle between surface normal and +Y, radians. */
  maxSlope: number;
  /** Horizontal jump speed along the facing direction in m/s. */
  jumpForwardSpeed: number;
  /** Initial upward jump speed in m/s. */
  jumpUpSpeed: number;
  /** Collision sphere radius of a snail in metres. */
  radius: number;
  /** Largest ledge a snail steps up or down while crawling, in metres. */
  stepHeight: number;
  /** Turn speed at full turn input in rad/s. */
  turnRate: number;
  /** Gravity acceleration in m/s^2 while airborne. */
  gravity: number;
}

/** Default movement configuration. */
export const DEFAULT_MOVEMENT_CONFIG: MovementConfig = {
  crawlSpeed: 1.5,
  maxSlope: (50 * Math.PI) / 180,
  jumpForwardSpeed: 2.5,
  jumpUpSpeed: 5,
  radius: 0.5,
  stepHeight: 0.3,
  turnRate: 2.5,
  gravity: GRAVITY,
};
