import type { MatchContent } from '../content/match-content.js';
import type { Simulation } from '../sim/simulation.js';
import { advanceResearch, cancelResearchHandler, queueResearchHandler } from './research-queue.js';

/**
 * Registers every research command handler and turn-start hook, in this fixed order (add new
 * lines at the end of the relevant group; keep this a short list):
 * 1. Calcium income at the owning team's turn start (M5-01).
 * 2. Research progress and start of the next queued tech (M5-03).
 * 3. Anything later jobs add.
 */
export function registerResearch(sim: Simulation, content: MatchContent): void {
  const techs = content.technologies;
  sim.registerCommandHandler('queueResearch', (ctx, cmd) => queueResearchHandler(ctx, cmd, techs));
  sim.registerCommandHandler('cancelResearch', (ctx, cmd) => cancelResearchHandler(ctx, cmd));
  sim.registerTurnStartHook('research-progress', (ctx, info) =>
    advanceResearch(ctx, info.teamId, techs),
  );
}
