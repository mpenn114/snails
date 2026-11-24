import type { SimContext } from '../sim/types.js';
import { setPhase } from './turn-phases.js';

/** Information passed to turn-start hooks. */
export interface TurnStartInfo {
  teamId: string | null;
  snailId: string | null;
  turnNumber: number;
}

/**
 * Hook run by the simulation, in registration order, in the step where a new turn begins
 * (after the `turnStarted` and `windChanged` events). Statuses, areas, crates and sudden death
 * register here. Use `ctx.rng` streams for any randomness.
 */
export type TurnStartHook = (ctx: SimContext, info: TurnStartInfo) => void;

/**
 * If a turn-start hook killed the active snail, ends its turn at once by moving to `settle`
 * (the turn machine then runs the win check and picks the next snail).
 */
export function skipTurnIfActiveDead(ctx: SimContext): void {
  const id = ctx.state.turn.activeSnailId;
  const snail = ctx.state.teams.flatMap((t) => t.snails).find((s) => s.id === id);
  if (snail && !snail.alive && ctx.state.turn.phase !== 'settle') {
    setPhase(ctx.state, 'settle', ctx.emit);
  }
}
