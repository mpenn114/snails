import { destroyCratesInRadius } from '../crate/crate-destroy.js';
import { applyDamage, findSnail, livingSnails } from '../entities/snail.js';
import { distance, normalize, sub } from '../math/vec3.js';
import { applyMeleeThorns, sourceHitMultiplier } from '../research/tech-effects.js';
import type { SimContext } from '../sim/types.js';
import type { Snail, Vec3 } from '../state/types.js';
import { type CarveResult, carveSphere, toCarveEvent } from '../terrain/carve.js';
import { resolveCollapse } from '../terrain/collapse.js';
import { SNAIL_RADIUS } from './projectile-system.js';

/** Shape of the damage falloff curve. */
export type FalloffKind = 'linear' | 'quadratic' | 'flat';

/** Static description of an explosion. */
export interface ExplosionSpec {
  /** Damage radius in metres. */
  radius: number;
  /** Damage at distance 0. */
  maxDamage: number;
  /** Knockback speed (m/s) at the centre. */
  knockback: number;
  /** Terrain carve radius; defaults to `radius`. */
  carveRadius?: number;
  falloff: FalloffKind;
  /** Drop (or remove, if unsupported) terrain left floating by the carve and emit terrainCollapsed; default false. */
  collapse?: boolean;
}

/** Who caused the explosion. */
export interface ExplosionSource {
  weaponId: string;
  ownerSnailId: string;
  /** True for melee strikes: the owner is never damaged, pushed or affected. */
  excludeOwner?: boolean;
}

/** One damaged snail in an explosion summary. */
export interface ExplosionHit {
  snailId: string;
  amount: number;
  remaining: number;
  killed: boolean;
}

/** Summary returned by {@link resolveExplosion}. */
export interface ExplosionResult {
  damaged: ExplosionHit[];
  killed: string[];
  carve: CarveResult;
}

/** Upward bias added to the knockback direction before normalising. */
const KNOCKBACK_UP_BIAS = 0.3;

/**
 * Returns the damage/knockback multiplier in [0, 1] at `distance` from the
 * centre: 1 at 0, 0 at or beyond `radius` (`flat` is 1 everywhere inside `radius`).
 */
export function computeFalloff(distance: number, radius: number, falloff: FalloffKind): number {
  if (!(radius > 0) || !(distance < radius)) return 0;
  if (falloff === 'flat') return 1;
  const t = 1 - Math.max(0, distance) / radius;
  return falloff === 'quadratic' ? t * t : t;
}

function knockbackDir(from: Vec3, to: Vec3): Vec3 {
  const dir = normalize(sub(to, from));
  return normalize({ x: dir.x, y: dir.y + KNOCKBACK_UP_BIAS, z: dir.z });
}

/** Removes terrain left floating by a carve and emits `terrainCollapsed` if anything fell. */
function collapseAfterCarve(ctx: SimContext, centre: Vec3, radius: number): void {
  const snails = ctx.state.teams.flatMap((t) => t.snails);
  const col = resolveCollapse(ctx.terrain, centre, radius, { snails });
  if (col.removedCells > 0 || col.fallen.length > 0) {
    ctx.emit({
      type: 'terrainCollapsed',
      chunks: col.chunks,
      removedCells: col.removedCells,
      fallen: col.fallen,
      cellIndices: col.cellIndices,
      cellValues: col.cellValues,
    });
  }
}

/** Carves a sphere, emits `terrainCarved` and (optionally) collapses floating terrain. */
export function carveAt(
  ctx: SimContext,
  centre: Vec3,
  radius: number,
  collapse: boolean | undefined,
  power?: number,
): CarveResult {
  const carve = carveSphere(ctx.terrain, centre, radius, power);
  ctx.emit({ type: 'terrainCarved', ...toCarveEvent(centre, radius, carve, power) });
  if (collapse === true && carve.cellsChanged > 0) collapseAfterCarve(ctx, centre, radius);
  return carve;
}

/** True when friendly fire is off and `snail` is a teammate (not the firer itself) of the source. */
function friendlyFireOff(ctx: SimContext, snail: Snail, source: ExplosionSource): boolean {
  if (ctx.state.rules?.friendlyFire !== false || snail.id === source.ownerSnailId) return false;
  const owner = findSnail(ctx.state, source.ownerSnailId);
  return owner !== undefined && owner.teamId === snail.teamId;
}

/** Pushes `snail` away from `centre` at `speed`; a push off the ground makes it airborne. */
function knockSnail(snail: Snail, centre: Vec3, speed: number): void {
  const dir = knockbackDir(centre, snail.position);
  snail.velocity = {
    x: snail.velocity.x + dir.x * speed,
    y: snail.velocity.y + dir.y * speed,
    z: snail.velocity.z + dir.z * speed,
  };
  if (speed > 0 && snail.grounded !== false) {
    // Knocked off the ground: the movement system now flies and lands the snail.
    snail.grounded = false;
    snail.airborneFromY = snail.position.y;
  }
}

/** Damage part of an explosion. */
export type DamageSpec = Pick<ExplosionSpec, 'radius' | 'maxDamage' | 'knockback' | 'falloff'>;

/**
 * Emits `explosion` (unless `announce` is false), then damages and knocks back every living snail in range (team/snail
 * order), emitting `snailDamaged` / `snailDied`.
 */
export function damageAround(
  ctx: SimContext,
  centre: Vec3,
  spec: DamageSpec,
  source: ExplosionSource,
  announce = true,
): { damaged: ExplosionHit[]; killed: string[] } {
  if (announce) {
    ctx.emit({
      type: 'explosion',
      position: { ...centre },
      radius: spec.radius,
      weaponId: source.weaponId,
    });
  }
  destroyCratesInRadius(ctx, centre, spec.radius);
  const damaged: ExplosionHit[] = [];
  const killed: string[] = [];
  for (const snail of livingSnails(ctx.state)) {
    if (source.excludeOwner && snail.id === source.ownerSnailId) continue;
    const dist = Math.max(0, distance(centre, snail.position) - SNAIL_RADIUS);
    const f = computeFalloff(dist, spec.radius, spec.falloff);
    if (f <= 0) continue;
    const friendly = friendlyFireOff(ctx, snail, source);
    const mul = friendly
      ? 0
      : sourceHitMultiplier(ctx, snail, source.ownerSnailId, source.excludeOwner === true);
    const result = applyDamage(snail, Math.round(spec.maxDamage * f * mul));
    knockSnail(snail, centre, spec.knockback * f);
    if (result.dealt > 0) {
      ctx.emit({
        type: 'snailDamaged',
        snailId: snail.id,
        amount: result.dealt,
        remaining: snail.health,
        sourceSnailId: source.ownerSnailId,
        cause: 'explosion',
      });
      damaged.push({
        snailId: snail.id,
        amount: result.dealt,
        remaining: snail.health,
        killed: result.killed,
      });
    }
    if (result.dealt > 0 && source.excludeOwner) applyMeleeThorns(ctx, snail, source.ownerSnailId);
    if (result.killed) {
      killed.push(snail.id);
      ctx.emit({ type: 'snailDied', snailId: snail.id, teamId: snail.teamId, cause: 'explosion' });
    }
  }
  return { damaged, killed };
}

/**
 * Resolves a classic explosion (carve, then damage) deterministically, emitting plain-data
 * events. Weapons use the `carve` and `damage` effects instead; this stays for direct callers.
 */
export function resolveExplosion(
  ctx: SimContext,
  centre: Vec3,
  spec: ExplosionSpec,
  source: ExplosionSource,
): ExplosionResult {
  ctx.emit({
    type: 'explosion',
    position: { ...centre },
    radius: spec.radius,
    weaponId: source.weaponId,
  });
  const carve = carveAt(
    ctx,
    centre,
    spec.carveRadius ?? spec.radius,
    spec.collapse,
    spec.maxDamage,
  );
  const { damaged, killed } = damageAround(ctx, centre, spec, source, false);
  return { damaged, killed, carve };
}
