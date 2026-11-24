import type { Vec3 } from '@snails/core';

/** A shot decision. angle in radians above horizontal, power in 0..1. */
export interface Shot {
  angle: number;
  power: number;
}

/** Inputs for choosing a shot. */
export interface AimContext {
  origin: Vec3;
  target: Vec3;
  wind: number;
  /** Muzzle speed at power 1. */
  maxSpeed: number;
}

/** Aim-only strategy (used by the balance runner and as a solver building block). */
export interface AimStrategy {
  chooseShot(ctx: AimContext): Shot;
}
