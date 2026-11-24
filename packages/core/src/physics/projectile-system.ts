import type { GameState, Projectile, Snail, Vec3 } from '../state/types.js';
import type { SimContext } from '../sim/types.js';
import { resolveMotion, stepMotion, type MotionSpec } from './motion.js';
import { sphereSweep } from '../terrain/collision.js';
import { add, distance, dot, normalize, scale, sub } from '../math/vec3.js';

/** Snail collision radius in metres. */
export const SNAIL_RADIUS = 0.5;
/** Projectiles below this world Y are removed. */
export const WORLD_FLOOR_Y = -10;
/** Seconds after spawn during which a projectile ignores its owner. */
export const OWNER_GRACE = 0.25;

/** Parameters for {@link spawnProjectile}; omitted fields take defaults. */
export interface ProjectileInit {
  position: Vec3;
  velocity: Vec3;
  ownerSnailId: string;
  weaponId: string;
  radius?: number;
  maxAge?: number;
  gravityScale?: number;
  windScale?: number;
  /** Motion strategy parameters; omitted = ballistic. */
  motion?: MotionSpec;
}

/** Adds a projectile to the state with id `p<counter>`; emits nothing. */
export function spawnProjectile(state: GameState, init: ProjectileInit): Projectile {
  const p: Projectile = {
    id: `p${state.nextProjectileId}`,
    position: { ...init.position },
    velocity: { ...init.velocity },
    ownerSnailId: init.ownerSnailId,
    weaponId: init.weaponId,
    radius: init.radius ?? 0.1,
    age: 0,
    maxAge: init.maxAge ?? 30,
    gravityScale: init.gravityScale ?? 1,
    windScale: init.windScale ?? 1,
    ...(init.motion ? { motion: { ...init.motion } } : {}),
  };
  state.nextProjectileId += 1;
  state.projectiles.push(p);
  return p;
}

/** A projectile contact: fraction `t` along the step, position, normal, and the snail hit (if any). */
export interface Contact {
  t: number;
  position: Vec3;
  normal: Vec3;
  snailId?: string;
}

function snailContact(p: Projectile, to: Vec3, snail: Snail): Contact | null {
  const seg = sub(to, p.position);
  const len2 = dot(seg, seg);
  const raw = len2 === 0 ? 0 : dot(sub(snail.position, p.position), seg) / len2;
  const t = Math.min(1, Math.max(0, raw));
  const closest = add(p.position, scale(seg, t));
  if (distance(closest, snail.position) > SNAIL_RADIUS + p.radius) return null;
  const normal = normalize(sub(closest, snail.position));
  return { t, position: closest, normal, snailId: snail.id };
}

/**
 * First terrain or snail contact of a projectile moving from its position to `to` this step
 * (the owner is ignored during `OWNER_GRACE`). Used by the projectile system and by AI impact
 * prediction so both resolve collisions identically. Does not mutate anything.
 */
export function findContact(
  ctx: Pick<SimContext, 'terrain' | 'state'>,
  p: Projectile,
  to: Vec3,
): Contact | null {
  let best: Contact | null = null;
  const hit = sphereSweep(ctx.terrain, p.position, to, p.radius);
  if (hit) best = { t: hit.t, position: hit.point, normal: hit.normal };
  for (const team of ctx.state.teams) {
    for (const snail of team.snails) {
      if (!snail.alive) continue;
      if (snail.id === p.ownerSnailId && p.age < OWNER_GRACE) continue;
      const c = snailContact(p, to, snail);
      if (c && (!best || c.t < best.t)) best = c;
    }
  }
  return best;
}

/** True when `pos` is below the world floor or outside the horizontal world bounds. */
export function outOfBounds(ctx: Pick<SimContext, 'terrain'>, pos: Vec3): boolean {
  const size = ctx.terrain.worldSize();
  return pos.y < WORLD_FLOOR_Y || pos.x < 0 || pos.z < 0 || pos.x > size.x || pos.z > size.z;
}

function byId(a: Projectile, b: Projectile): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** A projectile reaching its end of life where it should detonate (impact or fuse). */
export interface Detonation {
  projectileId: string;
  position: Vec3;
  normal: Vec3;
  weaponId: string;
  ownerSnailId: string;
  cause: 'hit' | 'fuse';
}

/** Called synchronously, in projectile id order, for every impact and fuse expiry. */
export type DetonationHandler = (ctx: SimContext, detonation: Detonation) => void;

function detonation(
  p: Projectile,
  position: Vec3,
  normal: Vec3,
  cause: Detonation['cause'],
): Detonation {
  return {
    projectileId: p.id,
    position: { ...position },
    normal,
    weaponId: p.weaponId,
    ownerSnailId: p.ownerSnailId,
    cause,
  };
}

/** Outcome of stepping one projectile: it stays, or it is gone. */
type StepOutcome = 'stay' | 'gone';

function expire(
  ctx: SimContext,
  p: Projectile,
  reason: 'fuse' | 'bounds',
  onDetonate: DetonationHandler | undefined,
): void {
  ctx.emit({ type: 'projectileExpired', projectileId: p.id, position: p.position, reason });
  if (reason === 'fuse') onDetonate?.(ctx, detonation(p, p.position, { x: 0, y: 1, z: 0 }, 'fuse'));
}

function hit(
  ctx: SimContext,
  p: Projectile,
  contact: Contact,
  onDetonate: DetonationHandler | undefined,
): void {
  ctx.emit({
    type: 'projectileHit',
    projectileId: p.id,
    position: contact.position,
    normal: contact.normal,
    weaponId: p.weaponId,
    ownerSnailId: p.ownerSnailId,
    ...(contact.snailId !== undefined ? { snailId: contact.snailId } : {}),
  });
  onDetonate?.(ctx, detonation(p, contact.position, contact.normal, 'hit'));
}

function stepOne(
  ctx: SimContext,
  p: Projectile,
  onDetonate: DetonationHandler | undefined,
): StepOutcome {
  const { motion, strategy } = resolveMotion(p.motion);
  const next = stepMotion(p, ctx.state.wind, ctx.dt);
  strategy.prepare?.(ctx, p, motion, next);
  const contact = findContact(ctx, p, next.position);
  if (contact) {
    const response =
      contact.snailId === undefined && strategy.onTerrainContact
        ? strategy.onTerrainContact(ctx, p, motion, contact, ctx.dt)
        : ({ action: 'detonate' } as const);
    if (response.action === 'detonate') {
      hit(ctx, p, contact, onDetonate);
      return 'gone';
    }
    if (response.action === 'expire') {
      ctx.emit({
        type: 'projectileExpired',
        projectileId: p.id,
        position: contact.position,
        reason: 'fuse',
      });
      return 'gone';
    }
    p.position = response.position;
    p.velocity = response.velocity;
  } else {
    p.position = next.position;
    p.velocity = next.velocity;
  }
  p.age += ctx.dt;
  const oob = outOfBounds(ctx, p.position);
  if (oob || p.age >= p.maxAge || strategy.finished?.(p, motion)) {
    expire(ctx, p, oob ? 'bounds' : 'fuse', onDetonate);
    return 'gone';
  }
  return 'stay';
}

/**
 * Builds the projectile system: steps projectiles (id order), resolves terrain and snail hits,
 * and removes finished ones. Emits `projectileHit` and `projectileExpired` (with
 * `reason: 'fuse' | 'bounds'`) and invokes `onDetonate` after each hit or fuse expiry. Motion
 * strategies may handle terrain contacts themselves (bounce, drill) and finish early (drill);
 * a snail contact always detonates.
 */
export function createProjectileSystem(onDetonate?: DetonationHandler): (ctx: SimContext) => void {
  return (ctx) => {
    const gone = new Set<string>();
    for (const p of [...ctx.state.projectiles].sort(byId)) {
      if (stepOne(ctx, p, onDetonate) === 'gone') gone.add(p.id);
    }
    ctx.state.projectiles = ctx.state.projectiles.filter((p) => !gone.has(p.id));
  };
}

/** Projectile system without detonation handling (projectiles just vanish). */
export const projectileSystem: (ctx: SimContext) => void = createProjectileSystem();
