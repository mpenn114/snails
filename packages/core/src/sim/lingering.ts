import { processAreasAtTurnStart } from '../area/area-system.js';
import type { MatchContent } from '../content/match-content.js';
import { processStatusesAtTurnStart } from '../status/status-system.js';
import type { Simulation } from './simulation.js';

/**
 * Registers the turn-start hooks that process lingering effects, in this order: statuses on the
 * team whose turn begins, then areas. Call once, before hooks of other features (crates,
 * sudden death) so their order is deterministic.
 */
export function registerLingeringEffects(sim: Simulation, content: MatchContent): void {
  sim.registerTurnStartHook('statuses', (ctx) => processStatusesAtTurnStart(ctx, content.statuses));
  sim.registerTurnStartHook('areas', (ctx) => processAreasAtTurnStart(ctx, content));
}
