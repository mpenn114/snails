import type { MatchContent } from '../content/match-content.js';
import type { SimEvent } from '../sim/events.js';
import type { Simulation } from '../sim/simulation.js';
import type { SimContext } from '../sim/types.js';
import { addCalcium, CALCIUM_INCOME } from './calcium.js';
import { advanceResearch, cancelResearchHandler, queueResearchHandler } from './research-queue.js';

function teamOf(ctx: SimContext, snailId: string): string | undefined {
  return ctx.state.teams.find((t) => t.snails.some((s) => s.id === snailId))?.id;
}

/** Turn start, step 1: per-turn counters (Moss Tax bookkeeping) and income for the owning team. */
function turnIncome(ctx: SimContext, teamId: string | null): void {
  const research = ctx.state.teams.find((t) => t.id === teamId)?.research;
  if (!research || teamId === null) return;
  research.roundsSinceDamage = research.damagedSinceTurnStart ? 0 : research.roundsSinceDamage + 1;
  research.damagedSinceTurnStart = false;
  research.damageCalciumThisTurn = 0;
  addCalcium(ctx, teamId, CALCIUM_INCOME.perTurn, 'turnIncome');
}

/** Converts damage to an enemy into Calcium (1 per 5, remainder carried, capped per turn). */
function damageIncome(ctx: SimContext, dealer: string, amount: number): void {
  const research = ctx.state.teams.find((t) => t.id === dealer)?.research;
  if (!research) return;
  research.damagedSinceTurnStart = true;
  research.roundsSinceDamage = 0;
  const total = (research.damageRemainder ?? 0) + amount;
  const whole = Math.floor(total / CALCIUM_INCOME.damagePerCalcium);
  research.damageRemainder = total - whole * CALCIUM_INCOME.damagePerCalcium;
  const room = CALCIUM_INCOME.damageCapPerTurn - research.damageCalciumThisTurn;
  const grant = Math.max(0, Math.min(whole, room));
  research.damageCalciumThisTurn += grant;
  if (grant > 0) addCalcium(ctx, dealer, grant, 'damage');
}

/**
 * Registers every research command handler and hook, in this fixed order (add new lines at the
 * end of the relevant group; keep this a short list). Turn start: (1) Calcium income (M5-01),
 * (2) research progress and start of the next queued tech (M5-03), (3) anything later jobs add.
 * An event observer grants damage and kill income. Does nothing when research is off.
 */
export function registerResearch(sim: Simulation, content: MatchContent): void {
  if ((sim.state.research ?? 'off') === 'off') return;
  const techs = content.technologies;
  sim.registerCommandHandler('queueResearch', (ctx, cmd) => queueResearchHandler(ctx, cmd, techs));
  sim.registerCommandHandler('cancelResearch', (ctx, cmd) => cancelResearchHandler(ctx, cmd));
  /** Team that last damaged each snail (for kill credit); cleared on death. */
  const lastEnemyHit = new Map<string, string>();
  sim.registerTurnStartHook('research-income', (ctx, info) => turnIncome(ctx, info.teamId));
  sim.registerTurnStartHook('research-progress', (ctx, info) =>
    advanceResearch(ctx, info.teamId, techs),
  );
  sim.registerEventObserver('research-income', (ctx, e: SimEvent) => {
    if (e.type === 'snailDamaged' && e.sourceSnailId !== null) {
      const dealer = teamOf(ctx, e.sourceSnailId);
      const victim = teamOf(ctx, e.snailId);
      if (!dealer || !victim || dealer === victim) return;
      lastEnemyHit.set(e.snailId, dealer);
      damageIncome(ctx, dealer, e.amount);
    } else if (e.type === 'snailDied') {
      const killer = lastEnemyHit.get(e.snailId);
      lastEnemyHit.delete(e.snailId);
      if (killer) addCalcium(ctx, killer, CALCIUM_INCOME.perKill, 'kill');
    }
  });
}
