import {
  DEFAULT_MOVEMENT_CONFIG,
  FIXED_DT,
  distance,
  type MatchSetup,
  type Snail,
  type Vec3,
} from '@snails/core';
import type { PlannedCommand } from '../cpu/types.js';
import { simulateMoves, type MoveOutcome } from './simulate.js';

/** Options for {@link planMovement}. */
export interface MovementOptions {
  /** Maximum number of candidate scripts simulated (the stay-put script is always included). */
  candidates: number;
  /** Length in ticks of the longest movement script (before the settle time). */
  maxTicks: number;
  /** Scores an end position (higher is better); defaults to height and distance from enemies. */
  scorePosition?: (snail: Snail, position: Vec3, enemies: readonly Snail[]) => number;
}

/** A movement script and its predicted end position. */
export interface MovementPlan {
  commands: PlannedCommand[];
  end: Vec3;
}

/** Extra ticks simulated after a script so the snail finishes falling or sliding. */
const SETTLE_TICKS = 30;
/** Minimum metres above the water line an end position must keep. */
const WATER_MARGIN = 1.5;
const HEADINGS = 8;

function activeSnail(match: MatchSetup, teamId: string): Snail | undefined {
  const { state } = match.sim;
  const team = state.teams.find((t) => t.id === teamId);
  const living = team?.snails.filter((s) => s.alive) ?? [];
  return living.find((s) => s.id === state.turn.activeSnailId) ?? living[0];
}

function enemiesOf(match: MatchSetup, teamId: string): Snail[] {
  return match.sim.state.teams
    .filter((t) => t.id !== teamId)
    .flatMap((t) => t.snails.filter((s) => s.alive));
}

/** Builds one script: turn toward heading `k` of 8, crawl `crawl` ticks (optionally jump), stop. */
function buildScript(id: string, k: number, crawl: number, jump: boolean): PlannedCommand[] {
  const angle = (Math.min(k, HEADINGS - k) * 2 * Math.PI) / HEADINGS;
  const turnTicks = Math.round(angle / (DEFAULT_MOVEMENT_CONFIG.turnRate * FIXED_DT));
  const turn = k <= HEADINGS / 2 ? 1 : -1;
  const out: PlannedCommand[] = [];
  if (turnTicks > 0) {
    out.push({ atTick: 0, command: { type: 'move', snailId: id, direction: 0, turn } });
  }
  out.push({
    atTick: turnTicks,
    command: { type: 'move', snailId: id, direction: 1, turn: 0, jump },
  });
  out.push({ atTick: turnTicks + crawl, command: { type: 'move', snailId: id, direction: 0 } });
  return out;
}

function candidateScripts(id: string, maxTicks: number, count: number): PlannedCommand[][] {
  const all: PlannedCommand[][] = [];
  const lengths = [maxTicks, Math.round(maxTicks / 2), Math.round(maxTicks / 4)];
  for (const crawl of lengths) {
    for (let k = 0; k < HEADINGS; k++) {
      for (const jump of [false, true]) all.push(buildScript(id, k, crawl, jump));
    }
  }
  const n = Math.max(0, count - 1);
  if (all.length <= n) return all;
  return Array.from({ length: n }, (_, i) => all[Math.floor((i * all.length) / n)]!);
}

function isSafe(match: MatchSetup, before: Snail, out: MoveOutcome): boolean {
  const water = match.sim.state.terrain.waterLevel;
  return (
    out.alive &&
    out.grounded &&
    out.health >= before.health &&
    out.position.y >= water + WATER_MARGIN
  );
}

function defaultScore(_s: Snail, p: Vec3, enemies: readonly Snail[]): number {
  const far = enemies.length ? Math.min(...enemies.map((e) => distance(p, e.position))) : 0;
  return p.y + 0.05 * far;
}

function search(
  match: MatchSetup,
  teamId: string,
  opts: MovementOptions,
  score: NonNullable<MovementOptions['scorePosition']>,
): MovementPlan {
  const snail = activeSnail(match, teamId);
  if (!snail) return { commands: [], end: { x: 0, y: 0, z: 0 } };
  const enemies = enemiesOf(match, teamId);
  let best: MovementPlan = { commands: [], end: { ...snail.position } };
  let bestScore = score(snail, snail.position, enemies);
  const ticks = opts.maxTicks + SETTLE_TICKS + Math.round(opts.maxTicks / 2);
  for (const script of candidateScripts(snail.id, opts.maxTicks, opts.candidates)) {
    const out = simulateMoves(match, snail.id, script, ticks);
    if (!isSafe(match, snail, out)) continue;
    const s = score(snail, out.position, enemies);
    if (s > bestScore) {
      bestScore = s;
      best = { commands: script, end: out.position };
    }
  }
  return best;
}

/**
 * Plans a movement script for the team's active (else first living) snail: candidate
 * turn-and-crawl (optionally jump) scripts are simulated on forks; those that lose health, die,
 * end airborne or end near the water line are rejected, and the best by `scorePosition` wins.
 * Standing still (empty script) wins unless a safe candidate scores strictly higher. Every
 * non-empty script ends with `move direction 0`.
 * @param match - Running match; never mutated.
 * @param teamId - Team to plan for.
 * @param opts - Candidate budget, script length and optional scoring.
 */
export function planMovement(
  match: MatchSetup,
  teamId: string,
  opts: MovementOptions,
): MovementPlan {
  return search(match, teamId, opts, opts.scorePosition ?? defaultScore);
}

/**
 * Plans a retreat: like {@link planMovement} but maximising the minimum distance to living
 * enemies while staying safe.
 * @param match - Running match; never mutated.
 * @param teamId - Team to plan for.
 * @param ticks - Longest crawl length in ticks.
 */
export function planRetreat(match: MatchSetup, teamId: string, ticks: number): MovementPlan {
  const minDist = (_s: Snail, p: Vec3, enemies: readonly Snail[]): number =>
    enemies.length ? Math.min(...enemies.map((e) => distance(p, e.position))) : 0;
  return search(match, teamId, { candidates: 9, maxTicks: ticks }, minDist);
}
