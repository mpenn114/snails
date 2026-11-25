import { forkMatch, livingSnails, type MatchSetup } from '@snails/core';
import { solveAim } from '../solver/index.js';
import { expectedDamage } from '../targeting/index.js';
import type { ThinkMeter } from './budget.js';
import { usableRanged, type ShotCandidate } from './weapon-plan.js';

/** Weight of the predicted enemy reply damage against the shot's own value. */
const REPLY_WEIGHT = 0.6;
/** Solver samples spent per enemy when predicting its reply. */
const REPLY_SAMPLES = 40;
/** Longest the candidate shot is simulated before the reply is judged (ticks). */
const MAX_SHOT_TICKS = 1500;
const DEAD_PENALTY = 200;
/** Simulated ticks that cost as much as one solver sample on the think meter. */
const TICKS_PER_WORK = 8;

/** Fires `cand` on a fork and steps until the turn leaves the shot phases. */
function playShot(
  match: MatchSetup,
  snailId: string,
  cand: ShotCandidate,
): { fork: MatchSetup; ticks: number } {
  const fork = forkMatch(match);
  const { angle, power, facing } = cand.aim;
  fork.sim.enqueue({ type: 'aim', snailId, angle, power, facing });
  fork.sim.enqueue({ type: 'fire', snailId, weaponId: cand.weaponId });
  let i = 0;
  for (; i < MAX_SHOT_TICKS; i++) {
    fork.sim.step();
    const phase = fork.sim.state.turn.phase;
    if (i > 0 && phase !== 'action' && phase !== 'fire' && phase !== 'resolve') break;
  }
  return { fork, ticks: i + 1 };
}

/**
 * Predicted damage the best enemy reply would deal to the shooter after `cand` is played:
 * the shot is simulated on a fork, then every living enemy solves a quick aim at the shooter's
 * resulting position with its best usable ranged weapon. A dead shooter counts as a heavy
 * penalty. Does not mutate `match`.
 * @param match - Match in the action phase of the shooter's turn.
 * @param snailId - The shooting snail.
 * @param cand - The candidate shot to judge.
 * @param meter - Optional meter charged with the solver work.
 */
export function enemyReplyDamage(
  match: MatchSetup,
  snailId: string,
  cand: ShotCandidate,
  meter?: ThinkMeter,
): number {
  const { fork: after, ticks } = playShot(match, snailId, cand);
  meter?.spend(Math.ceil(ticks / TICKS_PER_WORK));
  const { state, terrain } = after.sim;
  const me = livingSnails(state).find((s) => s.id === snailId);
  if (!me) return DEAD_PENALTY;
  let worst = 0;
  for (const enemy of livingSnails(state)) {
    if (enemy.teamId === me.teamId) continue;
    const weapon = usableRanged(after, enemy.teamId)[0];
    if (!weapon) continue;
    const samples = meter ? Math.min(REPLY_SAMPLES, meter.remaining()) : REPLY_SAMPLES;
    if (samples < 1 || meter?.expired()) break;
    const aim = solveAim(state, terrain, enemy, weapon, me.position, { samples });
    meter?.spend(aim.used);
    if (aim.miss > 6) continue;
    worst = Math.max(worst, expectedDamage(state, weapon, me.position, me));
  }
  return Math.min(worst, me.health);
}

/**
 * Two-turn lookahead: re-ranks the top `count` candidates by value minus the weighted enemy
 * reply damage (scaled by the personality's `caution`), so the CPU prefers the shot that leaves
 * its snail safest. Candidates beyond `count` keep their order after the re-ranked ones.
 * @param match - Match in the action phase of the shooter's turn.
 * @param snailId - The shooting snail.
 * @param ranked - Candidates sorted best first.
 * @param count - How many of the top candidates to judge.
 * @param caution - Personality caution multiplier.
 * @param meter - Optional meter; judging stops (keeping the shot order) once it runs dry.
 */
export function rerankByReply(
  match: MatchSetup,
  snailId: string,
  ranked: readonly ShotCandidate[],
  count: number,
  caution: number,
  meter?: ThinkMeter,
): ShotCandidate[] {
  const head = ranked.slice(0, count).map((c) => ({
    c,
    adj:
      meter && (meter.remaining() < REPLY_SAMPLES || meter.expired())
        ? c.value
        : c.value - REPLY_WEIGHT * caution * enemyReplyDamage(match, snailId, c, meter),
  }));
  head.sort((a, b) => b.adj - a.adj);
  return [...head.map((h) => h.c), ...ranked.slice(count)];
}
