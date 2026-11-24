import type { TechnologyDefinition } from '../content/types.js';
import { createMatch, type MatchSetup } from '../sim/match.js';
import type { SimEvent } from '../sim/events.js';
import { testMatchOptions } from '../sim/test-match.js';
import type { ResearchSetting } from './research-types.js';

/** Builds a tech definition for tests (tier 0, cost 10, one turn unless overridden). */
export function tech(id: string, over: Partial<TechnologyDefinition> = {}): TechnologyDefinition {
  return {
    id,
    name: id,
    branch: 'utility',
    tier: 0,
    cost: 10,
    prerequisites: [],
    description: '',
    ...over,
  };
}

/** A two-team test match with research on and every team given a TeamResearch. */
export function researchMatch(
  technologies: TechnologyDefinition[],
  setting: ResearchSetting = 'on',
  calcium = 100,
): MatchSetup {
  const m = createMatch({ ...testMatchOptions(5), technologies });
  m.sim.state.research = setting;
  for (const t of m.sim.state.teams) {
    t.research ??= {
      calcium,
      queue: [],
      active: null,
      damageCalciumThisTurn: 0,
      roundsSinceDamage: 0,
    };
    t.research.calcium = calcium;
  }
  return m;
}

/** Ends the active team's turn and steps until the next turn begins; returns the events. */
export function endTurn(m: MatchSetup): SimEvent[] {
  const { sim } = m;
  const events: SimEvent[] = [];
  const start = sim.state.turn.turnNumber;
  const teamId = sim.state.turn.activeTeamId as string;
  sim.enqueue({ type: 'endTurn', teamId });
  for (let i = 0; i < 6000 && sim.state.turn.turnNumber === start; i++) events.push(...sim.step());
  return events;
}
