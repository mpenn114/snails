import {
  blastEffect,
  teamStat,
  type DamageSpec,
  type GameState,
  type Snail,
  type TechRegistry,
  type Vec3,
  type WeaponDefinition,
} from '@snails/core';

/** Optional tech context so expected damage includes research multipliers. */
export interface DamageContext {
  /** Team firing the weapon (for `damageDealt`). */
  dealerTeamId?: string;
  /** Technology registry of the match. */
  techs?: TechRegistry;
}

/** Damage specs (with knockback) of every `damage` effect of a weapon. */
export function damageSpecs(weapon: WeaponDefinition): DamageSpec[] {
  const out: DamageSpec[] = [];
  for (const e of weapon.effects) {
    if (e.type === 'damage') {
      out.push({
        radius: e.radius,
        maxDamage: e.maxDamage,
        knockback: e.knockback ?? 0,
        falloff: e.falloff ?? 'linear',
      });
    }
  }
  return out;
}

function techMultiplier(state: GameState, snail: Snail, ctx: DamageContext): number {
  if (!ctx.techs) return 1;
  let m = teamStat(state, ctx.techs, snail.teamId, 'blastDamageTaken', 1);
  if (ctx.dealerTeamId !== undefined) {
    m *= teamStat(state, ctx.techs, ctx.dealerTeamId, 'damageDealt', 1);
  }
  return m;
}

/**
 * Expected damage of `weapon` detonating at `impact` on `snail`, using core's exact falloff and
 * rounding ({@link blastEffect}), summed over the weapon's damage effects. Not capped by health.
 * @param state - Game state (for tech lookups).
 * @param weapon - Weapon fired.
 * @param impact - Detonation point.
 * @param snail - Snail whose damage is estimated.
 * @param ctx - Optional tech context.
 */
export function expectedDamage(
  state: GameState,
  weapon: WeaponDefinition,
  impact: Vec3,
  snail: Snail,
  ctx: DamageContext = {},
): number {
  const mul = techMultiplier(state, snail, ctx);
  let total = 0;
  for (const spec of damageSpecs(weapon)) {
    total += blastEffect(spec, impact, snail.position, mul).damage;
  }
  return total;
}
