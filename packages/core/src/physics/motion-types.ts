import type { SimContext } from '../sim/types.js';
import type { Projectile, Vec3, Wind } from '../state/types.js';
import type { ProjectileState } from './ballistics.js';

/** Projectile state a motion strategy may read: kinematics plus age and steering input. */
export type MotionInput = ProjectileState & {
  /** Seconds since spawn (guidance window). */
  age?: number;
  /** Steering input -1..1 set by the `steer` command. */
  steer?: number;
};

/** A terrain contact found while sweeping a projectile along its step. */
export interface TerrainContact {
  /** Sphere centre at first contact. */
  position: Vec3;
  /** Unit surface normal at the contact. */
  normal: Vec3;
  /** Fraction of the step travelled before contact, 0..1. */
  t: number;
}

/**
 * What a motion does about a terrain contact: `detonate` (the default for ballistic),
 * `expire` (silently end the projectile, no effects) or `continue` with a new state.
 */
export type ContactResponse =
  | { action: 'detonate' }
  | { action: 'expire' }
  | { action: 'continue'; position: Vec3; velocity: Vec3 };

/**
 * How one motion kind advances a projectile. Only `step` is required and it must stay pure
 * (aim previews call it); the optional hooks let a motion interact with terrain.
 */
export interface MotionStrategy<M> {
  /** Returns the projectile state after `dt` seconds (free flight, ignoring terrain). */
  step(p: MotionInput, motion: M, wind: Wind, dt: number): ProjectileState;
  /** Called after `step`, before contacts are resolved; may mutate terrain (the drill carves). */
  prepare?(ctx: SimContext, p: Projectile, motion: M, next: ProjectileState): void;
  /** Resolves a terrain contact; absent means the projectile detonates on terrain. */
  onTerrainContact?(
    ctx: SimContext,
    p: Projectile,
    motion: M,
    contact: TerrainContact,
    dt: number,
  ): ContactResponse;
  /** True once the projectile has finished its run (silent end; fuse handling is separate). */
  finished?(p: Projectile, motion: M): boolean;
  /** Longest path in metres a preview should draw; absent means unlimited. */
  previewRange?(motion: M): number;
}
