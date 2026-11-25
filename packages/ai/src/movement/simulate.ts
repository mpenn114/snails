import { forkMatch, type MatchSetup, type Vec3 } from '@snails/core';
import type { PlannedCommand } from '../cpu/types.js';

/** End state of a simulated movement script. */
export interface MoveOutcome {
  position: Vec3;
  alive: boolean;
  health: number;
  grounded: boolean;
}

/**
 * Applies `commands` (at their tick offsets from now) to a fork of `match`, steps `ticks` fixed
 * ticks and reports the snail's end state. The original match is never mutated.
 * @param match - Running match (normally in the `action` phase).
 * @param snailId - Snail whose end state is reported.
 * @param commands - Commands with non-decreasing tick offsets.
 * @param ticks - Number of fixed ticks to simulate.
 */
export function simulateMoves(
  match: MatchSetup,
  snailId: string,
  commands: readonly PlannedCommand[],
  ticks: number,
): MoveOutcome {
  const fork = forkMatch(match);
  let next = 0;
  for (let t = 0; t < ticks; t++) {
    while (next < commands.length && commands[next]!.atTick <= t) {
      fork.sim.enqueue(commands[next]!.command);
      next++;
    }
    fork.sim.step();
  }
  const s = fork.sim.state.teams.flatMap((team) => team.snails).find((x) => x.id === snailId);
  if (!s) return { position: { x: 0, y: 0, z: 0 }, alive: false, health: 0, grounded: false };
  return {
    position: { ...s.position },
    alive: s.alive,
    health: s.health,
    grounded: s.grounded ?? true,
  };
}
