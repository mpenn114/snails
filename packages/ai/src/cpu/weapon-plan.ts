import {
  facingToward,
  facingVector,
  livingSnails,
  stockOf,
  weaponAvailability,
  type MatchSetup,
  type Snail,
  type Vec3,
  type WeaponDefinition,
} from '@snails/core';
import { predictImpact, solveAim, type SolverAim } from '../solver/index.js';
import {
  SELF_RISK,
  damageSpecs,
  rankTargets,
  scoreImpact,
  type ScoreWeights,
} from '../targeting/index.js';
import type { PersonalityProfile } from './personalities.js';

/** A concrete shot the CPU could take now, with its evaluation. */
export interface ShotCandidate {
  weaponId: string;
  targetId: string;
  aim: SolverAim;
  /** True for a melee strike (no projectile; aim angle is 0). */
  melee: boolean;
  /** Raw impact score (damage, kills, risks) before the stock-cost adjustment. */
  score: number;
  /** Score adjusted by the weapon's stock cost; candidates are ranked by this. */
  value: number;
  selfDamage: number;
  kills: number;
}

/** Options for {@link planWeaponShots}. */
export interface WeaponPlanOptions {
  /** Total solver samples across all weapons and targets. */
  samples: number;
  weights: ScoreWeights;
  profile: PersonalityProfile;
}

/** Shots scoring below this are "no good attack": the CPU prefers to move first. */
export const ATTACK_THRESHOLD = 15;

const MAX_WEAPONS = 4;
/** Generic preference used only to order weapons when the sample budget is too small for all. */
const CATEGORY_ORDER: Readonly<Record<string, number>> = {
  projectile: 5,
  thrown: 4,
  bouncing: 4,
  guided: 4,
  area: 3,
  special: 2,
};

/** Cost multiplier of spending one use of a weapon with `stock` left: infinite is 1, rare costs more. */
export function stockCost(stock: number): number {
  return Number.isFinite(stock) ? 1 + 2 / Math.max(1, stock) : 1;
}

/** Score divided by cost for positive scores, multiplied for negative ones (costly = worse). */
function adjusted(score: number, kills: number, cost: number): number {
  const c = kills > 0 ? 1 : cost;
  return score >= 0 ? score / c : score * c;
}

/** Weapons `teamId` can fire now (researched, in stock) that the solver can model, best category first. */
export function usableRanged(match: MatchSetup, teamId: string): WeaponDefinition[] {
  const team = match.sim.state.teams.find((t) => t.id === teamId);
  if (!team) return [];
  return match.weapons
    .list()
    .filter(
      (w) =>
        !w.melee &&
        w.endsAction !== false &&
        w.category in CATEGORY_ORDER &&
        damageSpecs(w).length > 0 &&
        weaponAvailability(team, w) === 'ok',
    )
    .sort((a, b) => (CATEGORY_ORDER[b.category] ?? 0) - (CATEGORY_ORDER[a.category] ?? 0));
}

/** Rejects shots whose self damage exceeds the personality's tolerance unless they kill. */
function riskAllowed(
  selfDamage: number,
  kills: number,
  shooter: Snail,
  p: PersonalityProfile,
): boolean {
  return kills > 0 || selfDamage <= p.selfRiskTolerance * shooter.health;
}

function evaluateAim(
  match: MatchSetup,
  shooter: Snail,
  weapon: WeaponDefinition,
  targetId: string,
  aim: SolverAim,
  opts: WeaponPlanOptions,
): ShotCandidate | null {
  const { state, terrain } = match.sim;
  const hit = predictImpact(state, terrain, shooter, weapon, aim);
  const s = scoreImpact(state, shooter.teamId, weapon, hit.position, opts.weights);
  if (!riskAllowed(s.selfDamage, s.kills, shooter, opts.profile)) return null;
  const team = state.teams.find((t) => t.id === shooter.teamId);
  const cost = stockCost(team ? stockOf(team, weapon) : Infinity);
  return {
    weaponId: weapon.id,
    targetId,
    aim,
    melee: false,
    score: s.score,
    value: adjusted(s.score, s.kills, cost),
    selfDamage: s.selfDamage,
    kills: s.kills,
  };
}

/** Melee candidates: strikes at enemies within reach plus most of the blast radius. */
function meleeCandidates(
  match: MatchSetup,
  shooter: Snail,
  opts: WeaponPlanOptions,
): ShotCandidate[] {
  const { state } = match.sim;
  const team = state.teams.find((t) => t.id === shooter.teamId);
  if (!team) return [];
  const out: ShotCandidate[] = [];
  const enemies = livingSnails(state).filter((s) => s.teamId !== shooter.teamId);
  for (const w of match.weapons.list()) {
    if (!w.melee || w.endsAction === false || weaponAvailability(team, w) !== 'ok') continue;
    const radius = Math.max(0, ...damageSpecs(w).map((d) => d.radius));
    for (const e of enemies) {
      const d = Math.hypot(e.position.x - shooter.position.x, e.position.z - shooter.position.z);
      if (d > w.melee.reach + radius * 0.6 || Math.abs(e.position.y - shooter.position.y) > 1.5) {
        continue;
      }
      const facing = facingToward(shooter.position, e.position);
      const f = facingVector({ ...shooter, facing });
      const at: Vec3 = {
        x: shooter.position.x + f.x * w.melee.reach,
        y: shooter.position.y,
        z: shooter.position.z + f.z * w.melee.reach,
      };
      const raw = scoreImpact(state, shooter.teamId, w, at, opts.weights);
      // Melee never hurts the attacker, so undo the self-damage penalty scoreImpact applied.
      const s = {
        ...raw,
        score: raw.score + raw.selfDamage * SELF_RISK * opts.weights.caution,
        selfDamage: 0,
      };
      if (s.score <= 0) continue;
      const cost = stockCost(stockOf(team, w));
      out.push({
        weaponId: w.id,
        targetId: e.id,
        aim: { angle: 0, power: 1, facing },
        melee: true,
        score: s.score,
        value: adjusted(s.score, s.kills, cost),
        selfDamage: s.selfDamage,
        kills: s.kills,
      });
    }
  }
  return out;
}

/** Solver budget plan: how many weapons and targets to evaluate for `samples` total. */
export function budgetShape(samples: number): { weapons: number; targets: number } {
  return {
    weapons: Math.min(MAX_WEAPONS, Math.max(1, Math.floor(samples / 100))),
    targets: samples >= 1000 ? 3 : samples >= 100 ? 2 : 1,
  };
}

/**
 * Evaluates every usable weapon against the best targets from the active snail's current spot and
 * returns the acceptable shots, best first. Ranged weapons (in stock, not locked, solver-modelled)
 * share the `samples` budget; each target shot is solved with `solveAim` and scored with
 * `scoreImpact`. Shots whose predicted self damage exceeds `selfRiskTolerance x health` are
 * dropped unless they kill. Value is score over a stock cost (rare stock costs more; kills ignore
 * cost). Melee weapons are considered only for enemies within their reach and need no samples.
 * Deterministic; does not mutate `match`.
 * @param match - Running match in the action phase.
 * @param teamId - Planning team (its active snail shoots).
 * @param opts - Sample budget and personality weights.
 */
export function planWeaponShots(
  match: MatchSetup,
  teamId: string,
  opts: WeaponPlanOptions,
): ShotCandidate[] {
  const { state, terrain } = match.sim;
  const shooter = livingSnails(state).find((s) => s.id === state.turn.activeSnailId);
  if (!shooter || shooter.teamId !== teamId) return [];
  const out = meleeCandidates(match, shooter, opts);
  const shape = budgetShape(opts.samples);
  const weapons = usableRanged(match, teamId).slice(0, shape.weapons);
  const targets = rankTargets(state, teamId, opts.weights).slice(0, shape.targets);
  const per = Math.max(10, Math.floor(opts.samples / Math.max(1, weapons.length * targets.length)));
  for (const w of weapons) {
    for (const t of targets) {
      const target = livingSnails(state).find((s) => s.id === t.snailId);
      if (!target) continue;
      const solved = solveAim(state, terrain, shooter, w, target.position, { samples: per });
      const aim = { angle: solved.angle, power: solved.power, facing: solved.facing };
      const c = evaluateAim(match, shooter, w, t.snailId, aim, opts);
      if (c) out.push(c);
    }
  }
  return out.sort((a, b) => b.value - a.value || (a.weaponId < b.weaponId ? -1 : 1));
}
