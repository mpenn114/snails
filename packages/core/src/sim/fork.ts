import type { MatchSetup } from './match.js';

/**
 * Forks a running match for lookahead. The result shares the (immutable) content registries but
 * owns a deep copy of the simulation: state, terrain voxels and RNG positions, plus the same
 * systems, handlers and hooks. Stepping or mutating the fork never affects the original.
 */
export function forkMatch(setup: MatchSetup): MatchSetup {
  return { ...setup, sim: setup.sim.fork() };
}
