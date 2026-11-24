import {
  canResearch,
  techCost,
  type GameState,
  type Team,
  type TechnologyDefinition,
} from '@snails/core';

/** Tech branches a team can focus on. */
export type Branch = TechnologyDefinition['branch'];

/** Every branch in a fixed order (index = `seed`-derived focus choice). */
export const BRANCHES: readonly Branch[] = ['weaponry', 'shell', 'mobility', 'utility'];

/** Picks a team's focus branch deterministically from the match seed and the team index. */
export function focusBranch(seed: number, teamIndex: number): Branch {
  const mixed = Math.imul(seed + 1, 2654435761) + Math.imul(teamIndex + 1, 40503);
  return BRANCHES[(mixed >>> 8) % BRANCHES.length] as Branch;
}

/**
 * Chooses the tech a team queues next: the cheapest valid tech of its focus branch (capstones
 * first, so it heads for the capstone once the prerequisites exist), else the cheapest valid
 * tech anywhere. Ties break by id, so the choice is deterministic. `null` when nothing is valid.
 */
export function pickTech(
  state: GameState,
  team: Team,
  techs: readonly TechnologyDefinition[],
  focus: Branch,
): TechnologyDefinition | null {
  const registry = { get: (id: string) => techs.find((t) => t.id === id) };
  const valid = techs.filter((t) => canResearch(state, team, t, registry).ok);
  const rank = (t: TechnologyDefinition): number[] => [
    t.branch === focus ? 0 : 1,
    t.capstone ? 0 : 1,
    techCost(state, team, t),
  ];
  valid.sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return (ra[i] ?? 0) - (rb[i] ?? 0);
    return a.id < b.id ? -1 : 1;
  });
  return valid[0] ?? null;
}
