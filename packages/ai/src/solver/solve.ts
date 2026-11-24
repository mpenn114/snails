import {
  GRAVITY,
  distance,
  facingToward,
  type GameState,
  type SdfGrid,
  type Snail,
  type Vec3,
  type WeaponDefinition,
} from '@snails/core';
import { predictImpact, type SolverAim } from './predict.js';

/** Options for {@link solveAim}. */
export interface SolveOptions {
  /** Maximum number of `predictImpact` calls. */
  samples: number;
}

/** Chosen aim and its predicted 3D miss distance (metres) from the target. */
export interface SolveResult extends SolverAim {
  miss: number;
}

interface Cand {
  angle: number;
  power: number;
  /** Yaw offset (rad) added to the facing toward the target, to cancel crosswind. */
  yaw: number;
  miss: number;
  /** Signed sideways error (m) of the impact relative to the target, positive along +perp. */
  lateral: number;
  /** Horizontal distance (m) from the shooter to the impact. */
  reach: number;
}

type Evaluate = (angle: number, power: number, yaw?: number) => Cand | null;

const MIN_ANGLE = 0.05;
const MAX_ANGLE = 1.5;
const SEED_ANGLES = 14;
const KEEP = 3;

const byMiss = (a: Cand, b: Cand): number => a.miss - b.miss;

/** Power needed to hit a point `d` away horizontally and `dy` higher at `angle`, ignoring wind. */
function closedFormPower(
  d: number,
  dy: number,
  angle: number,
  weapon: WeaponDefinition,
): number | null {
  const denom = 2 * Math.cos(angle) ** 2 * (d * Math.tan(angle) - dy);
  if (denom <= 1e-6) return null;
  const v = Math.sqrt((GRAVITY * weapon.launch.gravityScale * d * d) / denom);
  const { minSpeed, maxSpeed } = weapon.launch;
  return (v - minSpeed) / (maxSpeed - minSpeed);
}

/** Pattern-search hill climb from `start`, halving the step when no neighbour improves. */
function refine(start: Cand, evaluate: Evaluate, allowance: number): Cand {
  let cur = start;
  let step = 0.04;
  let used = 0;
  while (used < allowance && step > 1e-4) {
    let improved = false;
    for (const [da, dp, dy] of [
      [step, 0, 0],
      [-step, 0, 0],
      [0, step, 0],
      [0, -step, 0],
      [0, 0, step / 2],
      [0, 0, -step / 2],
    ] as const) {
      used += 1;
      const c = evaluate(cur.angle + da, cur.power + dp, cur.yaw + dy);
      if (c && c.miss < cur.miss) {
        cur = c;
        improved = true;
        break;
      }
    }
    if (!improved) step /= 2;
  }
  return cur;
}

/** Closed-form no-wind seeds across a spread of elevations (finds lobs over walls). */
function seedCandidates(
  evaluate: Evaluate,
  d: number,
  dy: number,
  weapon: WeaponDefinition,
): Cand[] {
  const out: Cand[] = [];
  for (let i = 0; i < SEED_ANGLES; i++) {
    const angle = MIN_ANGLE + ((MAX_ANGLE - MIN_ANGLE) * i) / (SEED_ANGLES - 1);
    const c = evaluate(angle, closedFormPower(d, dy, angle, weapon) ?? 1);
    if (c) out.push(c);
  }
  return out.sort(byMiss);
}

/** Re-aims each candidate sideways by the yaw that cancels its lateral error (wind drift). */
function windage(evaluate: Evaluate, cands: Cand[]): Cand[] {
  return cands.map((c) => {
    let cur = c;
    for (let i = 0; i < 2; i++) {
      const next = evaluate(cur.angle, cur.power, cur.yaw + cur.lateral / Math.max(cur.reach, 1));
      if (next && next.miss < cur.miss) cur = next;
    }
    return cur;
  });
}

/** Dense angle/power grid around each of `centres`. */
function gridAround(evaluate: Evaluate, centres: Cand[], side: number): Cand[] {
  const out: Cand[] = [];
  for (const s of centres) {
    for (let i = -side; i <= side; i++) {
      for (let j = -side; j <= side; j++) {
        const c = evaluate(s.angle + (i * 0.2) / side, s.power + (j * 0.2) / side, s.yaw);
        if (c) out.push(c);
      }
    }
  }
  return out;
}

/**
 * Finds an aim that lands a shot near `target`: faces the target, seeds closed-form no-wind
 * guesses over a spread of elevations (so blocked flat shots still find lobs), grid-samples
 * around the best seeds, then hill-climbs the best few. Every candidate is scored by
 * {@link predictImpact} (real gravity, wind and terrain) as the 3D distance from impact to
 * target. Never throws; if nothing reaches the target `miss` is simply large. Deterministic.
 * @param state - Current game state.
 * @param terrain - The match terrain grid.
 * @param shooter - Firing snail.
 * @param weapon - Weapon to fire.
 * @param target - World position to hit.
 * @param opts - `samples` caps the number of impact predictions.
 */
export function solveAim(
  state: GameState,
  terrain: SdfGrid,
  shooter: Snail,
  weapon: WeaponDefinition,
  target: Vec3,
  opts: SolveOptions,
): SolveResult {
  const facing = facingToward(shooter.position, target);
  const budget = Math.max(1, Math.floor(opts.samples));
  let calls = 0;
  const seen = new Map<string, Cand>();
  const evaluate: Evaluate = (angle, power, yaw = 0) => {
    const a = Math.min(MAX_ANGLE, Math.max(MIN_ANGLE, angle));
    const p = Math.min(1, Math.max(0.02, power));
    const key = `${a.toFixed(4)}/${p.toFixed(4)}/${yaw.toFixed(4)}`;
    const old = seen.get(key);
    if (old) return old;
    if (calls >= budget) return null;
    calls += 1;
    const hit = predictImpact(state, terrain, shooter, weapon, {
      angle: a,
      power: p,
      facing: facing + yaw,
    });
    const ix = hit.position.x - target.x;
    const iz = hit.position.z - target.z;
    const c: Cand = {
      angle: a,
      power: p,
      yaw,
      miss: distance(hit.position, target),
      lateral: ix * Math.sin(facing + yaw) + iz * Math.cos(facing + yaw),
      reach: Math.hypot(hit.position.x - shooter.position.x, hit.position.z - shooter.position.z),
    };
    seen.set(key, c);
    return c;
  };
  const d = Math.hypot(target.x - shooter.position.x, target.z - shooter.position.z);
  const dy = target.y - shooter.position.y;
  const seeds = seedCandidates(evaluate, d, dy, weapon);
  const best = windage(evaluate, seeds.slice(0, KEEP));
  const side = Math.max(1, Math.floor(Math.sqrt((budget * 0.4) / KEEP) / 2));
  const grid = gridAround(evaluate, best, side);
  const finalists = [...best, ...grid].sort(byMiss).slice(0, KEEP);
  const left = budget - calls;
  const refined = finalists.map((f) => refine(f, evaluate, Math.floor(left / KEEP)));
  const winner = [...refined, ...finalists, ...seeds].sort(byMiss)[0] as Cand;
  return {
    angle: winner.angle,
    power: winner.power,
    facing: facing + winner.yaw,
    miss: winner.miss,
  };
}
