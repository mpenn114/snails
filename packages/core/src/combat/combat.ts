import { runEffects } from '../content/effects/handlers.js';
import { buildMatchContent, withContent, type MatchContent } from '../content/match-content.js';
import type { WeaponDefinition, WeaponLaunchSpec } from '../content/types.js';
import type { ContentRegistry } from '../content/registry.js';
import { findSnail, setFacing } from '../entities/snail.js';
import { FIXED_DT, type ProjectileState } from '../physics/ballistics.js';
import { isGuidable, resolveMotion, type MotionSpec } from '../physics/motion.js';
import { distance } from '../math/vec3.js';
import { patternOffsets } from './pattern.js';
import {
  createProjectileSystem,
  spawnProjectile,
  type Detonation,
} from '../physics/projectile-system.js';
import type { Simulation } from '../sim/simulation.js';
import type { AimCommand, FireCommand, SimContext, SteerCommand } from '../sim/types.js';
import type { Aim, Snail, Vec3, Wind } from '../state/types.js';
import { notifyFired } from '../turn/turn-phases.js';

/** Aim used by snails that have not aimed yet. */
export const DEFAULT_AIM: Aim = { angle: Math.PI / 4, power: 0.5 };

/** Returns the snail's aim, or the default. */
export function getAim(snail: Snail): Aim {
  return snail.aim ?? DEFAULT_AIM;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * Handles `aim` commands: optionally turns the snail to `facing`, then stores the clamped aim.
 * Non-finite values are ignored.
 */
export function aimCommandHandler(ctx: SimContext, cmd: AimCommand): void {
  const snail = findSnail(ctx.state, cmd.snailId);
  if (!snail || !snail.alive) return;
  if (!Number.isFinite(cmd.angle) || !Number.isFinite(cmd.power)) return;
  if (cmd.facing !== undefined) setFacing(snail, cmd.facing);
  snail.aim = {
    angle: clamp(cmd.angle, -Math.PI / 2, Math.PI / 2),
    power: clamp(cmd.power, 0, 1),
  };
}

/**
 * Handles `steer` commands: stores the input on each of the snail's projectiles that is still
 * inside its guidance window (so only the owner steers, and only while guided).
 */
export function steerCommandHandler(ctx: SimContext, cmd: SteerCommand): void {
  if (!Number.isFinite(cmd.input)) return;
  const input = clamp(cmd.input, -1, 1);
  for (const p of ctx.state.projectiles) {
    if (p.ownerSnailId === cmd.snailId && isGuidable(p)) p.steer = input;
  }
}

/** Spawn position and initial velocity of a shot. */
export interface LaunchResult {
  position: Vec3;
  velocity: Vec3;
}

/**
 * The single source of truth for how an aim becomes a projectile: speed is
 * `minSpeed + (maxSpeed - minSpeed) * power`, the direction is the facing (yaw, as in
 * `facingVector`) tilted by `angle`, and the projectile spawns `projectileRadius + 0.5` m along
 * it. Pure; used by the `fire` handler and by clients previewing a shot.
 */
export function computeLaunch(
  origin: Vec3,
  facing: number,
  aim: Aim,
  launch: WeaponLaunchSpec,
): LaunchResult {
  const dir = {
    x: Math.cos(facing) * Math.cos(aim.angle),
    y: Math.sin(aim.angle),
    z: -Math.sin(facing) * Math.cos(aim.angle),
  };
  const speed = launch.minSpeed + (launch.maxSpeed - launch.minSpeed) * aim.power;
  const offset = launch.projectileRadius + 0.5;
  return {
    position: {
      x: origin.x + dir.x * offset,
      y: origin.y + dir.y * offset,
      z: origin.z + dir.z * offset,
    },
    velocity: { x: dir.x * speed, y: dir.y * speed, z: dir.z * speed },
  };
}

/**
 * Samples the unobstructed (no terrain) path of a shot for aim previews: position of the
 * projectile every `stepsPerSample` fixed steps, starting at its spawn point. Built on
 * `computeLaunch` and the weapon's motion strategy `step` (wind included) so it cannot drift
 * from the sim: a drill previews as a straight line cut off at its length, a bouncing stone as
 * its first free arc. Pure. `motion` omitted means ballistic.
 */
export function predictTrajectory(
  origin: Vec3,
  facing: number,
  aim: Aim,
  launch: WeaponLaunchSpec,
  wind: Wind,
  samples = 24,
  stepsPerSample = 5,
  motion?: MotionSpec,
): Vec3[] {
  const resolved = resolveMotion(motion);
  const range = resolved.strategy.previewRange?.(resolved.motion) ?? Infinity;
  const clamped = {
    angle: clamp(aim.angle, -Math.PI / 2, Math.PI / 2),
    power: clamp(aim.power, 0, 1),
  };
  const shot = computeLaunch(origin, facing, clamped, launch);
  let p: ProjectileState = {
    ...shot,
    gravityScale: launch.gravityScale,
    windScale: launch.windScale,
  };
  const out: Vec3[] = [];
  for (let i = 0; i < samples; i++) {
    out.push({ ...p.position });
    if (distance(shot.position, p.position) >= range) break;
    for (let k = 0; k < stepsPerSample; k++) {
      p = resolved.strategy.step(p, resolved.motion, wind, FIXED_DT);
    }
  }
  return out;
}

/** Creates the `fire` handler: spawns the weapon's projectile(s) and notifies the turn machine. */
export function fireCommandHandler(
  weapons: ContentRegistry<WeaponDefinition>,
): (ctx: SimContext, cmd: FireCommand) => void {
  return (ctx, cmd) => {
    const weapon = weapons.get(cmd.weaponId);
    const snail = findSnail(ctx.state, cmd.snailId);
    if (!weapon || !snail || !snail.alive) return;
    const aim = getAim(snail);
    for (const off of patternOffsets(weapon.pattern, aim.power)) {
      const angle = clamp(aim.angle + off.angle, -Math.PI / 2, Math.PI / 2);
      const facing = snail.facing + off.yaw;
      const shot = computeLaunch(
        snail.position,
        facing,
        { angle, power: aim.power },
        weapon.launch,
      );
      const p = spawnProjectile(ctx.state, {
        position: shot.position,
        velocity: shot.velocity,
        ownerSnailId: snail.id,
        weaponId: weapon.id,
        radius: weapon.launch.projectileRadius,
        gravityScale: weapon.launch.gravityScale,
        windScale: weapon.launch.windScale,
        ...(weapon.fuseSeconds > 0 ? { maxAge: weapon.fuseSeconds } : {}),
        ...(weapon.motion ? { motion: weapon.motion } : {}),
      });
      ctx.emit({
        type: 'projectileFired',
        projectileId: p.id,
        weaponId: weapon.id,
        snailId: snail.id,
        position: { ...p.position },
        velocity: { ...p.velocity },
      });
    }
    notifyFired(ctx.state, (e) => ctx.emit(e));
  };
}

/** Creates the detonation handler: runs the weapon's effects on impact or fuse expiry. */
export function createDetonationHandler(
  content: MatchContent,
): (ctx: SimContext, d: Detonation) => void {
  return (ctx, d) => {
    const weapon = content.weapons.get(d.weaponId);
    if (!weapon) return;
    if (d.cause === 'fuse' && !(weapon.fuseSeconds > 0)) return;
    runEffects(withContent(ctx, content), weapon.effects, d.position, {
      weaponId: weapon.id,
      ownerSnailId: d.ownerSnailId,
    });
  };
}

/**
 * Registers aim/fire handlers and the projectile system (which detonates weapons inline, so
 * effects resolve in the same step as the hit). Call once per simulation. `statuses` and `areas`
 * default to empty registries.
 */
export function registerCombat(
  sim: Simulation,
  registries: { weapons: ContentRegistry<WeaponDefinition> } & Partial<MatchContent>,
): void {
  const empty = buildMatchContent({ weapons: [] });
  const content: MatchContent = {
    weapons: registries.weapons,
    statuses: registries.statuses ?? empty.statuses,
    areas: registries.areas ?? empty.areas,
  };
  sim.registerCommandHandler('aim', aimCommandHandler);
  sim.registerCommandHandler('fire', fireCommandHandler(content.weapons));
  sim.registerCommandHandler('steer', steerCommandHandler);
  sim.addSystem('projectiles', createProjectileSystem(createDetonationHandler(content)));
}
