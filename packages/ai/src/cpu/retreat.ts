import { forkMatch, livingSnails, type MatchSetup, type Rng } from '@snails/core';
import { planRetreat } from '../movement/index.js';
import type { ThinkMeter } from './budget.js';
import type { PersonalityProfile } from './personalities.js';
import type { PlannedCommand } from './types.js';

/** Longest crawl (ticks) of a retreat script. */
const RETREAT_TICKS = 90;
/** Work units charged to the think meter for one retreat plan (fork run plus candidates). */
const RETREAT_WORK = 60;
/** Give up looking for the retreat phase after this many simulated ticks. */
const MAX_SHOT_TICKS = 900;

/**
 * Plans the post-shot retreat of `teamId`'s active snail. With probability
 * `profile.retreatChance` it plays `shot` on a fork until the retreat phase starts, then runs
 * `planRetreat` from there. Returns commands with ticks relative to the start of the retreat
 * phase (always ending in `move direction 0`), or `undefined` when the CPU stays put, the shot
 * never reaches the retreat phase or no safer spot was found. Never mutates `match`.
 * @param match - Match in the action phase, before `shot` is played.
 * @param teamId - Planning team.
 * @param shot - The turn's planned commands (moves, aim, fire).
 * @param profile - Personality supplying `retreatChance`.
 * @param rng - Seeded per-turn RNG (one draw is consumed).
 * @param meter - Optional meter: charged {@link RETREAT_WORK}; skipped after an emergency cutoff.
 */
export function planPostShotRetreat(
  match: MatchSetup,
  teamId: string,
  shot: readonly PlannedCommand[],
  profile: PersonalityProfile,
  rng: Rng,
  meter?: ThinkMeter,
): PlannedCommand[] | undefined {
  if (rng.next() >= profile.retreatChance) return undefined;
  if (meter?.expired()) return undefined;
  meter?.spend(RETREAT_WORK);
  if (!shot.some((c) => c.command.type === 'fire')) return undefined;
  const fork = forkMatch(match);
  let next = 0;
  for (let t = 0; t < MAX_SHOT_TICKS && fork.sim.state.turn.phase !== 'retreat'; t++) {
    while (next < shot.length && shot[next]!.atTick <= t) {
      fork.sim.enqueue(shot[next]!.command);
      next++;
    }
    fork.sim.step();
  }
  const { state } = fork.sim;
  if (state.turn.phase !== 'retreat' || state.turn.activeTeamId !== teamId) return undefined;
  if (!livingSnails(state).some((s) => s.id === state.turn.activeSnailId)) return undefined;
  const plan = planRetreat(fork, teamId, RETREAT_TICKS);
  return plan.commands.length > 0 ? plan.commands : undefined;
}
