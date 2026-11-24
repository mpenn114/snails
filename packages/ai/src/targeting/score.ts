import {
  blastEffect,
  livingSnails,
  type GameState,
  type Snail,
  type Vec3,
  type WeaponDefinition,
} from '@snails/core';
import { damageSpecs, expectedDamage, type DamageContext } from './damage.js';
import { DEFAULT_WEIGHTS, type ScoreWeights } from './weights.js';

/** Result of scoring a predicted impact. */
export interface ImpactScore {
  score: number;
  enemyDamage: number;
  allyDamage: number;
  selfDamage: number;
  kills: number;
}

/** Multiplier on damage dealt to the shooter itself. */
export const SELF_RISK = 1.5;
/** Multiplier on damage dealt to allies. */
export const ALLY_RISK = 1.0;
/** Bonus for pushing an enemy toward water (penalty for own side). */
const WATER_BONUS = 25;
/** Metres of extra reach per m/s of knockback when estimating a push. */
const PUSH_PER_SPEED = 0.25;

/** Approximate: would the knockback leave the snail at or below the water surface? */
function pushedIntoWater(
  state: GameState,
  weapon: WeaponDefinition,
  impact: Vec3,
  s: Snail,
): boolean {
  let speed = 0;
  for (const spec of damageSpecs(weapon)) speed += blastEffect(spec, impact, s.position).knockback;
  if (speed <= 0) return false;
  return s.position.y - state.terrain.waterLevel < 1 + speed * PUSH_PER_SPEED;
}

/**
 * Scores detonating `weapon` at `impact` for `shooterTeamId` per docs/ai.md: expected damage
 * times value (enemies positive; allies x1.0 and self x1.5 negative), plus a kill bonus and a
 * knockback-into-water bonus. The shooter is the active snail, if any.
 * @param state - Game state.
 * @param shooterTeamId - Firing team.
 * @param weapon - Weapon fired.
 * @param impact - Predicted detonation point.
 * @param weights - Personality weights.
 * @param ctx - Optional tech context.
 */
export function scoreImpact(
  state: GameState,
  shooterTeamId: string,
  weapon: WeaponDefinition,
  impact: Vec3,
  weights: ScoreWeights = DEFAULT_WEIGHTS,
  ctx: DamageContext = {},
): ImpactScore {
  const shooterId = state.turn.activeSnailId;
  const dctx = { dealerTeamId: shooterTeamId, ...ctx };
  const r: ImpactScore = { score: 0, enemyDamage: 0, allyDamage: 0, selfDamage: 0, kills: 0 };
  for (const s of livingSnails(state)) {
    const dmg = expectedDamage(state, weapon, impact, s, dctx);
    const wet = pushedIntoWater(state, weapon, impact, s);
    if (s.teamId === shooterTeamId) {
      const isSelf = s.id === shooterId;
      if (isSelf) r.selfDamage += dmg;
      else r.allyDamage += dmg;
      const risk = isSelf ? SELF_RISK : ALLY_RISK;
      r.score -= (dmg * risk + (wet ? WATER_BONUS : 0)) * weights.caution;
    } else {
      const dealt = Math.min(dmg, s.health);
      const killed = dmg >= s.health && dmg > 0;
      r.enemyDamage += dealt;
      const rv = weights.revenge;
      const grudge = rv && (rv.snailId === s.id || rv.teamId === s.teamId) ? rv.factor : 1;
      r.score += dealt * weights.aggression * grudge;
      if (killed) {
        r.kills += 1;
        r.score += weights.killBonus;
      } else if (wet) r.score += WATER_BONUS * weights.aggression;
    }
  }
  return r;
}
