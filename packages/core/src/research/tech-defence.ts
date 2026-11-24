import { applyDamage, findSnail, heal } from '../entities/snail.js';
import type { SimContext } from '../sim/types.js';
import type { Snail } from '../state/types.js';
import { distance } from '../math/vec3.js';
import { teamStat } from './tech-effects.js';

/**
 * Defensive tech stats (docs/technology-research.md): `projectileReflect` (a fraction of a
 * projectile hit returns to the firer) and `healPerStillTurn` (heal at turn start when the snail
 * has not moved since its previous turn start). Both are generic stat queries, no per-tech code.
 */

/** A snail moving less than this (metres) between its team's turn starts counts as still. */
const STILL_EPSILON = 0.05;

/** Applies `amount` damage to `target` from `source`, emitting the usual events. */
function hurt(ctx: SimContext, target: Snail, amount: number, sourceId: string): void {
  const result = applyDamage(target, amount);
  if (result.dealt > 0) {
    ctx.emit({
      type: 'snailDamaged',
      snailId: target.id,
      amount: result.dealt,
      remaining: target.health,
      sourceSnailId: sourceId,
      cause: 'explosion',
    });
  }
  if (result.killed) {
    ctx.emit({ type: 'snailDied', snailId: target.id, teamId: target.teamId, cause: 'explosion' });
  }
}

/**
 * `projectileReflect`: returns `dealt * fraction` of a projectile hit on `victim` to the firer
 * (once per struck snail; never to the victim itself).
 */
export function applyProjectileReflect(
  ctx: SimContext,
  victim: Snail,
  attackerId: string,
  dealt: number,
): void {
  if (!ctx.techs || attackerId === victim.id) return;
  const fraction = teamStat(ctx.state, ctx.techs, victim.teamId, 'projectileReflect', 0);
  const attacker = findSnail(ctx.state, attackerId);
  const amount = Math.round(dealt * fraction);
  if (amount <= 0 || !attacker?.alive) return;
  hurt(ctx, attacker, amount, victim.id);
}

/** Team turn start: heals still snails by `healPerStillTurn`, then records positions. */
export function tickStillHealing(ctx: SimContext, teamId: string | null): void {
  const team = ctx.state.teams.find((t) => t.id === teamId);
  if (!team || !ctx.techs) return;
  const amount = Math.round(teamStat(ctx.state, ctx.techs, team.id, 'healPerStillTurn', 0));
  for (const s of team.snails) {
    const still = s.stillRef !== undefined && distance(s.stillRef, s.position) < STILL_EPSILON;
    if (s.alive && still && amount > 0) heal(s, amount);
    s.stillRef = { ...s.position };
  }
}
