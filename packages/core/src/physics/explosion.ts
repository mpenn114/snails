import { applyDamage, livingSnails } from '../entities/snail.js';
import { distance, normalize, sub } from '../math/vec3.js';
import type { SimContext } from '../sim/types.js';
import type { Vec3 } from '../state/types.js';
import { type CarveResult, carveSphere, toCarveEvent } from '../terrain/carve.js';
import { resolveCollapse } from '../terrain/collapse.js';
import { SNAIL_RADIUS } from './projectile-system.js';

/** Shape of the damage falloff curve. */
export type FalloffKind = 'linear' | 'quadratic';

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
 * centre: 1 at 0, 0 at or beyond `radius`.
 */
export function computeFalloff(distance: number, radius: number, falloff: FalloffKind): number {
  if (!(radius > 0) || !(distance < radius)) return 0;
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
    });
  }
}

/**
 * Resolves an explosion deterministically: carve, then per living snail (in
 * team/snail order) damage and knockback, emitting plain-data events.
 */
export function resolveExplosion(
  ctx: SimContext,
  centre: Vec3,
  spec: ExplosionSpec,
  source: ExplosionSource,
): ExplosionResult {
  const carveRadius = spec.carveRadius ?? spec.radius;
  const carve = carveSphere(ctx.terrain, centre, carveRadius);
  ctx.emit({
    type: 'explosion',
    position: { ...centre },
    radius: spec.radius,
    weaponId: source.weaponId,
  });
  ctx.emit({ type: 'terrainCarved', ...toCarveEvent(centre, carveRadius, carve) });
  if (spec.collapse === true && carve.cellsChanged > 0)
    collapseAfterCarve(ctx, centre, carveRadius);

  const damaged: ExplosionHit[] = [];
  const killed: string[] = [];
  for (const snail of livingSnails(ctx.state)) {
    const dist = Math.max(0, distance(centre, snail.position) - SNAIL_RADIUS);
    const f = computeFalloff(dist, spec.radius, spec.falloff);
    if (f <= 0) continue;
    const result = applyDamage(snail, Math.round(spec.maxDamage * f));
    const dir = knockbackDir(centre, snail.position);
    const speed = spec.knockback * f;
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
    if (result.killed) {
      killed.push(snail.id);
      ctx.emit({ type: 'snailDied', snailId: snail.id, teamId: snail.teamId, cause: 'explosion' });
    }
  }
  return { damaged, killed, carve };
}
