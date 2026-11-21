import type { WeaponDefinition } from '../content/types.js';
import type { ContentRegistry } from '../content/registry.js';
import { facingVector, findSnail, setFacing } from '../entities/snail.js';
import { resolveExplosion } from '../physics/explosion.js';
import {
  createProjectileSystem,
  spawnProjectile,
  type Detonation,
} from '../physics/projectile-system.js';
import type { Simulation } from '../sim/simulation.js';
import type { AimCommand, FireCommand, SimContext } from '../sim/types.js';
import type { Aim, Snail } from '../state/types.js';
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

/** Creates the `fire` handler: spawns the weapon's projectile and notifies the turn machine. */
export function fireCommandHandler(
  weapons: ContentRegistry<WeaponDefinition>,
): (ctx: SimContext, cmd: FireCommand) => void {
  return (ctx, cmd) => {
    const weapon = weapons.get(cmd.weaponId);
    const snail = findSnail(ctx.state, cmd.snailId);
    if (!weapon || !snail || !snail.alive) return;
    const aim = getAim(snail);
    const f = facingVector(snail);
    const dir = {
      x: f.x * Math.cos(aim.angle),
      y: Math.sin(aim.angle),
      z: f.z * Math.cos(aim.angle),
    };
    const { minSpeed, maxSpeed } = weapon.launch;
    const speed = minSpeed + (maxSpeed - minSpeed) * aim.power;
    const offset = weapon.launch.projectileRadius + 0.5;
    const p = spawnProjectile(ctx.state, {
      position: {
        x: snail.position.x + dir.x * offset,
        y: snail.position.y + dir.y * offset,
        z: snail.position.z + dir.z * offset,
      },
      velocity: { x: dir.x * speed, y: dir.y * speed, z: dir.z * speed },
      ownerSnailId: snail.id,
      weaponId: weapon.id,
      radius: weapon.launch.projectileRadius,
      gravityScale: weapon.launch.gravityScale,
      windScale: weapon.launch.windScale,
      ...(weapon.fuseSeconds > 0 ? { maxAge: weapon.fuseSeconds } : {}),
    });
    ctx.emit({
      type: 'projectileFired',
      projectileId: p.id,
      weaponId: weapon.id,
      snailId: snail.id,
      position: { ...p.position },
      velocity: { ...p.velocity },
    });
    notifyFired(ctx.state, (e) => ctx.emit(e));
  };
}

/** Creates the detonation handler: resolves the weapon's explosion on impact or fuse expiry. */
export function createDetonationHandler(
  weapons: ContentRegistry<WeaponDefinition>,
): (ctx: SimContext, d: Detonation) => void {
  return (ctx, d) => {
    const weapon = weapons.get(d.weaponId);
    if (!weapon) return;
    if (d.cause === 'fuse' && !(weapon.fuseSeconds > 0)) return;
    resolveExplosion(ctx, d.position, weapon.explosion, {
      weaponId: weapon.id,
      ownerSnailId: d.ownerSnailId,
    });
  };
}

/**
 * Registers aim/fire handlers and the projectile system (which detonates weapons inline, so
 * explosions resolve in the same step as the hit). Call once per simulation.
 */
export function registerCombat(
  sim: Simulation,
  registries: { weapons: ContentRegistry<WeaponDefinition> },
): void {
  sim.registerCommandHandler('aim', aimCommandHandler);
  sim.registerCommandHandler('fire', fireCommandHandler(registries.weapons));
  sim.addSystem('projectiles', createProjectileSystem(createDetonationHandler(registries.weapons)));
}
