import {
  FIXED_DT,
  computeLaunch,
  findContact,
  outOfBounds,
  stepMotion,
  type GameState,
  type Projectile,
  type SdfGrid,
  type Snail,
  type Vec3,
  type WeaponDefinition,
} from '@snails/core';

/** Aim to evaluate: elevation angle (rad), power 0..1 and world yaw facing (rad). */
export interface SolverAim {
  angle: number;
  power: number;
  facing: number;
}

/** Predicted outcome of a shot. */
export interface ImpactPrediction {
  /** Where the projectile ended (contact point, fuse position or last position). */
  position: Vec3;
  /** Fixed steps simulated. */
  ticks: number;
  /** True when it ended on terrain (false: snail hit, fuse, water or out of bounds). */
  hitTerrain: boolean;
}

/** Default projectile lifetime in seconds (matches `spawnProjectile`). */
const DEFAULT_MAX_AGE = 30;

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * Simulates the shot a real `fire` would spawn, using core's launch maths, motion strategy
 * (gravity and wind) and contact resolution, and stops at the first contact, the fuse, or
 * leaving the world (including falling into water below the world floor). Does not mutate
 * `state`. Bounce and drill behaviour after first contact is not modelled.
 * @param state - Current game state (wind, snails).
 * @param terrain - The match terrain grid.
 * @param shooter - Firing snail (its position and id are used; `aim.facing` overrides its facing).
 * @param weapon - Weapon fired.
 * @param aim - Angle, power and facing to evaluate.
 */
export function predictImpact(
  state: GameState,
  terrain: SdfGrid,
  shooter: Snail,
  weapon: WeaponDefinition,
  aim: SolverAim,
): ImpactPrediction {
  const angle = clamp(aim.angle, -Math.PI / 2, Math.PI / 2);
  const shot = computeLaunch(
    shooter.position,
    aim.facing,
    { angle, power: clamp(aim.power, 0, 1) },
    weapon.launch,
  );
  const p: Projectile = {
    id: 'predicted',
    position: shot.position,
    velocity: shot.velocity,
    ownerSnailId: shooter.id,
    weaponId: weapon.id,
    radius: weapon.launch.projectileRadius,
    age: 0,
    maxAge: weapon.fuseSeconds > 0 ? weapon.fuseSeconds : DEFAULT_MAX_AGE,
    gravityScale: weapon.launch.gravityScale,
    windScale: weapon.launch.windScale,
    ...(weapon.motion ? { motion: weapon.motion } : {}),
  };
  const ctx = { state, terrain };
  let ticks = 0;
  for (;;) {
    const next = stepMotion(p, state.wind, FIXED_DT);
    ticks += 1;
    const contact = findContact(ctx, p, next.position);
    if (contact) {
      return { position: contact.position, ticks, hitTerrain: contact.snailId === undefined };
    }
    p.position = next.position;
    p.velocity = next.velocity;
    p.age += FIXED_DT;
    if (outOfBounds(ctx, p.position) || p.age >= p.maxAge) {
      return { position: p.position, ticks, hitTerrain: false };
    }
  }
}
