import type { SimContext } from '../sim/types.js';
import { addCalcium, CALCIUM_INCOME } from './calcium.js';

/** Tunables of the anti-snowball and anti-stalemate rules, in one place. */
export const ANTI_SNOWBALL = {
  /** A team under this fraction of the leader's total living health earns comeback Calcium. */
  catchUpRatio: 0.6,
  /** Comeback Calcium at 0 health (scales linearly down to 0 at `catchUpRatio`). */
  catchUpMax: 10,
  /** Each tech a team owns makes its further techs this much pricier (0.05 = +5%). */
  costPerOwnedTech: 0.05,
  /** Rounds without damaging an enemy after which the Moss Tax applies. */
  mossTaxRounds: 5,
  /** Fraction of the base per-turn income removed by the Moss Tax. */
  mossTaxFraction: 0.5,
} as const;

/**
 * Comeback Calcium for a team with `own` total health against the leader's `leader`.
 * Linear: 0 at `catchUpRatio` of the leader, `catchUpMax` at 0 health, rounded up (min 1 when
 * under the threshold). 0 when not behind enough.
 */
export function catchUpAmount(own: number, leader: number): number {
  const { catchUpRatio, catchUpMax } = ANTI_SNOWBALL;
  if (leader <= 0 || own >= leader * catchUpRatio) return 0;
  const behind = (catchUpRatio - own / leader) / catchUpRatio;
  return Math.min(catchUpMax, Math.max(1, Math.ceil(catchUpMax * behind - 1e-9)));
}

/** Total living health of a team. */
function teamHealth(ctx: SimContext, teamId: string): number {
  const team = ctx.state.teams.find((t) => t.id === teamId);
  return team ? team.snails.reduce((sum, s) => sum + (s.alive ? s.health : 0), 0) : 0;
}

/** Grants comeback Calcium (`catchUp`) to a team far behind the health leader. */
export function grantCatchUp(ctx: SimContext, teamId: string): void {
  const own = teamHealth(ctx, teamId);
  const leader = Math.max(...ctx.state.teams.map((t) => teamHealth(ctx, t.id)));
  const amount = catchUpAmount(own, leader);
  if (amount > 0) addCalcium(ctx, teamId, amount, 'catchUp');
}

/** True when a team has gone `mossTaxRounds` or more rounds without damaging an enemy. */
export function mossTaxActive(roundsSinceDamage: number): boolean {
  return roundsSinceDamage >= ANTI_SNOWBALL.mossTaxRounds;
}

/** Removes part of the base per-turn income (`mossTax`) from a team that is turtling. */
export function applyMossTax(ctx: SimContext, teamId: string, roundsSinceDamage: number): void {
  if (!mossTaxActive(roundsSinceDamage)) return;
  const cut = Math.floor(CALCIUM_INCOME.perTurn * ANTI_SNOWBALL.mossTaxFraction);
  addCalcium(ctx, teamId, -cut, 'mossTax');
}

/** Price multiplier for a team that owns `owned` techs (the caller rounds up). */
export function costScale(owned: number): number {
  return 1 + ANTI_SNOWBALL.costPerOwnedTech * owned;
}
