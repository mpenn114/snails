import { spawnArea } from '../../area/area-system.js';
import { applyWater, isWaterArea } from '../../area/water-area.js';
import { findSnail, livingSnails } from '../../entities/snail.js';
import { distance, normalize } from '../../math/vec3.js';
import { attachRope } from '../../rope/rope-system.js';
import { carveAt, damageAround } from '../../physics/explosion.js';
import { SNAIL_RADIUS, spawnProjectile } from '../../physics/projectile-system.js';
import { scheduleEffect } from '../../scheduled/scheduled-system.js';
import { applyStatus } from '../../status/status-system.js';
import type { Vec3 } from '../../state/types.js';
import type { EffectContext } from '../match-content.js';
import type { Effect, EffectOf, EffectType } from './effect-schemas.js';

/** Who caused an effect. */
export interface EffectSource {
  weaponId: string;
  ownerSnailId: string;
  /** True for melee strikes: damage and status effects skip the owner. */
  excludeOwner?: boolean;
}

/** Handler for one effect type: runs the effect at `at`, mutating state and emitting events. */
export type EffectHandler<E extends Effect = Effect> = (
  ctx: EffectContext,
  effect: E,
  at: Vec3,
  source: EffectSource,
) => void;

const damage: EffectHandler<EffectOf<'damage'>> = (ctx, e, at, source) => {
  damageAround(
    ctx,
    at,
    {
      radius: e.radius,
      maxDamage: e.maxDamage,
      knockback: e.knockback ?? 0,
      falloff: e.falloff ?? 'linear',
    },
    source,
    e.announce !== false,
  );
};

const carve: EffectHandler<EffectOf<'carve'>> = (ctx, e, at) => {
  carveAt(ctx, at, e.radius, e.collapse, e.power);
};

const status: EffectHandler<EffectOf<'status'>> = (ctx, e, at, source) => {
  const def = ctx.content.statuses.get(e.statusId);
  if (!def) return;
  for (const snail of livingSnails(ctx.state)) {
    if (source.excludeOwner && snail.id === source.ownerSnailId) continue;
    if (distance(at, snail.position) - SNAIL_RADIUS > e.radius) continue;
    applyStatus(ctx, snail, def, {
      turns: e.turns ?? def.defaultTurns ?? 1,
      magnitude: e.magnitude ?? 1,
      sourceSnailId: source.ownerSnailId,
    });
  }
};

/** Height above the detonation point at which sub-projectiles start (clears the crater lip). */
const SUB_PROJECTILE_LIFT = 0.3;
const DEFAULT_SUB_SPREAD = Math.PI / 6;

const spawn: EffectHandler<EffectOf<'spawn'>> = (ctx, e, at, source) => {
  const what = e.spawn;
  if (what.what === 'area') {
    const def = ctx.content.areas.get(what.areaId);
    if (!def) return;
    const area = spawnArea(ctx, def, {
      position: at,
      ...(what.radius !== undefined ? { radius: what.radius } : {}),
      ...(what.turns !== undefined ? { turns: what.turns } : {}),
      sourceSnailId: source.ownerSnailId,
    });
    if (isWaterArea(def)) applyWater(ctx, area, def);
    return;
  }
  const weapon = ctx.content.weapons.get(what.weaponId);
  if (!weapon) return;
  const cone = what.spread ?? DEFAULT_SUB_SPREAD;
  for (let i = 0; i < what.count; i++) {
    const az = (2 * Math.PI * i) / what.count;
    const dir = normalize({
      x: Math.cos(az) * Math.sin(cone),
      y: Math.cos(cone),
      z: Math.sin(az) * Math.sin(cone),
    });
    spawnProjectile(ctx.state, {
      position: { x: at.x, y: at.y + SUB_PROJECTILE_LIFT, z: at.z },
      velocity: { x: dir.x * what.speed, y: dir.y * what.speed, z: dir.z * what.speed },
      ownerSnailId: source.ownerSnailId,
      weaponId: weapon.id,
      radius: weapon.launch.projectileRadius,
      gravityScale: weapon.launch.gravityScale,
      windScale: weapon.launch.windScale,
      ...(weapon.fuseSeconds > 0 ? { maxAge: weapon.fuseSeconds } : {}),
      ...(weapon.motion ? { motion: weapon.motion } : {}),
    });
  }
};

const move: EffectHandler<EffectOf<'move'>> = (ctx, e, at, source) => {
  const snail = findSnail(ctx.state, source.ownerSnailId);
  if (!snail || !snail.alive) return;
  const from = { ...snail.position };
  snail.position = { x: at.x, y: at.y + (e.lift ?? 0), z: at.z };
  snail.velocity = { x: 0, y: 0, z: 0 };
  snail.grounded = false;
  snail.airborneFromY = snail.position.y;
  ctx.emit({ type: 'snailMoved', snailId: snail.id, from, to: { ...snail.position } });
};

const reel: EffectHandler<EffectOf<'reel'>> = (ctx, e, at, source) => {
  const snail = findSnail(ctx.state, source.ownerSnailId);
  if (!snail || !snail.alive || snail.rope) return;
  attachRope(ctx, snail, at, e.seconds, e.standoff);
};

const schedule: EffectHandler<EffectOf<'schedule'>> = (ctx, e, at, source) => {
  scheduleEffect(ctx, e, at, source);
};

/**
 * The effect handler table: ONE handler per effect type. Adding an effect type means adding
 * its schema to `EffectSchema` and one entry here; weapons never get weapon-specific code.
 */
export const effectHandlers: { [T in EffectType]: EffectHandler<EffectOf<T>> } = {
  damage,
  carve,
  status,
  spawn,
  move,
  reel,
  schedule,
};

/** Runs effects in order at a detonation point. */
export function runEffects(
  ctx: EffectContext,
  effects: readonly Effect[],
  at: Vec3,
  source: EffectSource,
): void {
  for (const effect of effects) {
    (effectHandlers[effect.type] as EffectHandler)(ctx, effect, at, source);
  }
}
