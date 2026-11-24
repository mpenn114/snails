import type { MatchContent } from '../content/match-content.js';
import type { SimEvent } from '../sim/events.js';
import type { Simulation } from '../sim/simulation.js';
import type { Snail } from '../state/types.js';
import type { SimContext } from '../sim/types.js';
import { applyMossTax, grantCatchUp } from './anti-snowball.js';
import { addCalcium, CALCIUM_INCOME } from './calcium.js';
import { applyCompletionEffects, tickStockGrants } from './tech-completion.js';
import { dispatchTechHooks, teamStat } from './tech-effects.js';
import { advanceResearch, cancelResearchHandler, queueResearchHandler } from './research-queue.js';

function teamOf(ctx: SimContext, snailId: string): string | undefined {
  return ctx.state.teams.find((t) => t.snails.some((s) => s.id === snailId))?.id;
}

function allSnails(ctx: SimContext): Snail[] {
  return ctx.state.teams.flatMap((t) => t.snails);
}

/** Turn start, step 1: per-turn counters (Moss Tax bookkeeping) and income for the owning team. */
function turnIncome(ctx: SimContext, teamId: string | null): void {
  const research = ctx.state.teams.find((t) => t.id === teamId)?.research;
  if (!research || teamId === null) return;
  research.roundsSinceDamage = research.damagedSinceTurnStart ? 0 : research.roundsSinceDamage + 1;
  research.damagedSinceTurnStart = false;
  research.damageCalciumThisTurn = 0;
  const income = teamStat(ctx.state, ctx.techs, teamId, 'calciumPerTurn', CALCIUM_INCOME.perTurn);
  addCalcium(ctx, teamId, Math.round(income), 'turnIncome');
  applyMossTax(ctx, teamId, research.roundsSinceDamage);
  grantCatchUp(ctx, teamId);
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
 * (2) repeating stock grants (M5-05), (3) research progress and start of the next queued tech
 * (M5-03), (4) anything later jobs add. The `research-effects` observer dispatches tech hooks and
 * applies one-time effects when `researchCompleted` fires (M5-05).
 * An event observer grants damage and kill income. Does nothing when research is off.
 */
export function registerResearch(sim: Simulation, content: MatchContent): void {
  if ((sim.state.research ?? 'off') === 'off') return;
  const techs = content.technologies;
  sim.registerCommandHandler('queueResearch', (ctx, cmd) => queueResearchHandler(ctx, cmd, techs));
  sim.registerCommandHandler('cancelResearch', (ctx, cmd) => cancelResearchHandler(ctx, cmd));
  sim.registerTurnStartHook('research-income', (ctx, info) => turnIncome(ctx, info.teamId));
  sim.registerTurnStartHook('research-stock', (ctx, info) => tickStockGrants(ctx, info.teamId));
  sim.registerTurnStartHook('research-progress', (ctx, info) =>
    advanceResearch(ctx, info.teamId, techs),
  );
  sim.registerEventObserver('research-effects', (ctx, e: SimEvent) => {
    dispatchTechHooks(ctx, e);
    if (e.type !== 'researchCompleted') return;
    const team = ctx.state.teams.find((t) => t.id === e.teamId);
    if (team) {
      applyCompletionEffects(ctx, team, e.techId, techs, (id) => content.weapons.get(id)?.ammo);
    }
  });
  sim.registerEventObserver('research-income', (ctx, e: SimEvent) => {
    if (e.type === 'snailDamaged' && e.sourceSnailId !== null) {
      const dealer = teamOf(ctx, e.sourceSnailId);
      const victim = teamOf(ctx, e.snailId);
      if (!dealer || !victim || dealer === victim) return;
      const hurt = allSnails(ctx).find((s) => s.id === e.snailId);
      if (hurt) hurt.lastHitByTeam = dealer;
      damageIncome(ctx, dealer, e.amount);
    } else if (e.type === 'snailDied') {
      const dead = allSnails(ctx).find((s) => s.id === e.snailId);
      const killer = dead?.lastHitByTeam;
      if (dead) delete dead.lastHitByTeam;
      if (killer) addCalcium(ctx, killer, CALCIUM_INCOME.perKill, 'kill');
    }
  });
}
