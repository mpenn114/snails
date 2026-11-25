import { findSnail, type MatchSetup, type WeaponDefinition } from '@snails/core';
import { predictImpact, solveAim, type SolverAim } from '../solver/index.js';
import { rankTargets } from './rank.js';
import { scoreImpact } from './score.js';
import { DEFAULT_WEIGHTS, type ScoreWeights } from './weights.js';

/** Chosen target with its aim and score. */
export interface TargetChoice {
  targetId: string;
  aim: SolverAim;
  score: number;
}

/** Number of top-ranked targets evaluated. */
const TOP_N = 3;

/**
 * Picks the best enemy to shoot with `weapon`: for the top ranked targets runs the aiming solver
 * (`samples` predictions each), scores the predicted impact and returns the highest scoring
 * choice, or null when there is no active shooter on `teamId` or no enemy. Does not mutate
 * `match`; ties keep the earlier (higher ranked) target.
 */
export function chooseTarget(
  match: MatchSetup,
  teamId: string,
  weapon: WeaponDefinition,
  samples: number,
  weights: ScoreWeights = DEFAULT_WEIGHTS,
): TargetChoice | null {
  const { state, terrain } = match.sim;
  const activeId = state.turn.activeSnailId;
  const shooter = activeId ? findSnail(state, activeId) : undefined;
  if (!shooter || shooter.teamId !== teamId) return null;
  let best: TargetChoice | null = null;
  for (const t of rankTargets(state, teamId, weights).slice(0, TOP_N)) {
    const target = findSnail(state, t.snailId);
    if (!target) continue;
    const solved = solveAim(state, terrain, shooter, weapon, target.position, { samples });
    const aim: SolverAim = { angle: solved.angle, power: solved.power, facing: solved.facing };
    const hit = predictImpact(state, terrain, shooter, weapon, aim);
    const score = scoreImpact(state, teamId, weapon, hit.position, weights).score;
    if (best === null || score > best.score) best = { targetId: t.snailId, aim, score };
  }
  return best;
}
