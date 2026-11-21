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

/** Strategy interface implemented by all CPU aiming behaviours. */
export interface CpuPlayer {
  chooseShot(ctx: AimContext): Shot;
}
