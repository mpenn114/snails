import type { SimContext } from '../sim/types.js';
import type { Team } from '../state/types.js';
import type { TechRegistry } from './tech-rules.js';
import { canResearch, techCost, techTurns } from './tech-rules.js';

function spend(ctx: SimContext, team: Team, delta: number, reason: 'spent' | 'refund'): void {
  const r = team.research;
  if (!r || delta === 0) return;
  r.calcium += delta;
  ctx.emit({ type: 'calciumChanged', teamId: team.id, delta, balance: r.calcium, reason });
}

/**
 * Starts the first queued tech that is valid and affordable (pay Calcium, emit `researchStarted`).
 * Queued techs that are no longer valid are dropped with `researchCancelled` (refund 0); ones that
 * are too expensive stay waiting. Does nothing while a tech is active.
 */
export function startNextResearch(ctx: SimContext, team: Team, registry: TechRegistry): void {
  const r = team.research;
  if (!r || r.active) return;
  for (const techId of [...r.queue]) {
    const def = registry.get(techId);
    if (!def || !canResearch(ctx.state, team, def, registry, true).ok) {
      r.queue = r.queue.filter((id) => id !== techId);
      ctx.emit({ type: 'researchCancelled', teamId: team.id, techId, refund: 0 });
      continue;
    }
    const cost = techCost(ctx.state, team, def);
    if (cost > r.calcium) continue;
    const turns = techTurns(ctx.state, def);
    r.queue = r.queue.filter((id) => id !== techId);
    spend(ctx, team, -cost, 'spent');
    r.active = { techId, turnsLeft: turns, paid: cost };
    ctx.emit({ type: 'researchStarted', teamId: team.id, techId, turns, cost });
    return;
  }
}

/** `queueResearch`: appends the tech and starts it at once when the team is idle and can pay. */
export function queueResearchHandler(
  ctx: SimContext,
  cmd: { teamId: string; techId: string },
  registry: TechRegistry,
): void {
  const team = ctx.state.teams.find((t) => t.id === cmd.teamId);
  if (!team?.research) return;
  team.research.queue.push(cmd.techId);
  ctx.emit({ type: 'researchQueued', teamId: team.id, techId: cmd.techId });
  startNextResearch(ctx, team, registry);
}

/** `cancelResearch`: waiting techs leave free; the active one refunds 50% of paid (rounded down). */
export function cancelResearchHandler(
  ctx: SimContext,
  cmd: { teamId: string; techId: string },
): void {
  const team = ctx.state.teams.find((t) => t.id === cmd.teamId);
  const r = team?.research;
  if (!team || !r) return;
  let refund = 0;
  if (r.active?.techId === cmd.techId) {
    refund = Math.floor(r.active.paid / 2);
    r.active = null;
    spend(ctx, team, refund, 'refund');
  } else if (r.queue.includes(cmd.techId)) {
    r.queue = r.queue.filter((id) => id !== cmd.techId);
  } else return;
  ctx.emit({ type: 'researchCancelled', teamId: team.id, techId: cmd.techId, refund });
}

/**
 * Turn-start step for the team whose turn begins: counts the active tech down; at 0 it joins
 * `team.researched` and `researchCompleted` fires (it counts at once). Then, in the same turn
 * start, the next affordable queued tech begins.
 */
export function advanceResearch(ctx: SimContext, teamId: string | null, reg: TechRegistry): void {
  const team = ctx.state.teams.find((t) => t.id === teamId);
  const r = team?.research;
  if (!team || !r) return;
  if (r.active) {
    r.active.turnsLeft -= 1;
    if (r.active.turnsLeft <= 0) {
      const techId = r.active.techId;
      r.active = null;
      team.researched.push(techId);
      ctx.emit({ type: 'researchCompleted', teamId: team.id, techId });
    }
  }
  startNextResearch(ctx, team, reg);
}
