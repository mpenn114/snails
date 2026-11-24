import type { CalciumReason } from '../sim/events.js';
import type { SimContext } from '../sim/types.js';
import type { TeamResearch } from './research-types.js';

/** Calcium amounts of the economy in one place so balance work can tune them. */
export const CALCIUM_INCOME = {
  /** Granted at the owning team's turn start. */
  perTurn: 10,
  /** One Calcium per this much damage dealt to enemy snails. */
  damagePerCalcium: 5,
  /** Cap on damage-based Calcium earned per turn. */
  damageCapPerTurn: 15,
  /** Granted per enemy snail killed. */
  perKill: 10,
} as const;

/** Fresh research state for a team at match start. */
export function emptyTeamResearch(): TeamResearch {
  return { calcium: 0, queue: [], active: null, damageCalciumThisTurn: 0, roundsSinceDamage: 0 };
}

/**
 * Adds `delta` Calcium to a team (negative spends), clamping the balance at 0, and emits
 * `calciumChanged` with the applied delta. No-op when the team has no research state or the
 * applied change is zero.
 */
export function addCalcium(
  ctx: SimContext,
  teamId: string,
  delta: number,
  reason: CalciumReason,
): void {
  const research = ctx.state.teams.find((t) => t.id === teamId)?.research;
  if (!research) return;
  const balance = Math.max(0, research.calcium + delta);
  const applied = balance - research.calcium;
  if (applied === 0) return;
  research.calcium = balance;
  ctx.emit({ type: 'calciumChanged', teamId, delta: applied, balance, reason });
}
