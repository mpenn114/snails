import {
  distance,
  forkMatch,
  livingSnails,
  type MatchSetup,
  Rng,
  type Snail,
  type Vec3,
} from '@snails/core';
import { planMovement } from '../movement/index.js';
import type { ScoreWeights } from '../targeting/index.js';
import { DIFFICULTY_PROFILES, type DifficultyProfile } from './difficulty.js';
import { rerankByReply } from './lookahead.js';
import { PERSONALITY_PROFILES, type PersonalityProfile } from './personalities.js';
import type { CpuConfig, PlannedCommand, TurnPlan } from './types.js';
import { ATTACK_THRESHOLD, planWeaponShots, type ShotCandidate } from './weapon-plan.js';

/** Ticks between the aim command and the fire command (the aim "settles"). */
const AIM_TO_FIRE_TICKS = 30;
/** Longest crawl (ticks) of a movement script. */
const MOVE_TICKS = 90;
/** Ticks simulated after a movement script so the snail finishes sliding or falling. */
const SETTLE_TICKS = 45;
/** Number of top shots the two-turn lookahead judges. */
const LOOKAHEAD_COUNT = 3;
/** Preferred distance (m) to the nearest enemy when repositioning. */
const IDEAL_RANGE = 14;

/** Standard normal sample (Box-Muller) from `rng`; always consumes two draws. */
function gauss(rng: Rng): number {
  const u = Math.max(1e-9, rng.next());
  const v = rng.next();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function endTurnPlan(teamId: string, from: PlannedCommand[], tick: number): TurnPlan {
  return { commands: [...from, { atTick: tick, command: { type: 'endTurn', teamId } }] };
}

function planWeights(p: PersonalityProfile): ScoreWeights {
  return { aggression: p.aggression, caution: p.caution, killBonus: p.killBonus };
}

/** Per-turn RNG: same seed and same match moment give the same draws. */
function turnRng(match: MatchSetup, seed: number): Rng {
  const { tick, turn } = match.sim.state;
  return new Rng(
    (seed ^ Math.imul(tick + 1, 0x9e3779b1) ^ Math.imul(turn.turnNumber + 1, 0x85ebca6b)) >>> 0,
  );
}

/** A match copy in which the wind is zero (a CPU that "ignores the wind"). */
function withoutWind(match: MatchSetup): MatchSetup {
  const fork = forkMatch(match);
  fork.sim.state.wind = { strength: 0, direction: 0 };
  return fork;
}

/** Prefers high ground at a comfortable range from the nearest enemy. */
function positionScore(_s: Snail, p: Vec3, enemies: readonly Snail[]): number {
  const near = enemies.length ? Math.min(...enemies.map((e) => distance(p, e.position))) : 0;
  return 0.3 * p.y - 0.15 * Math.abs(near - IDEAL_RANGE);
}

/** Applies `commands` to a fork, steps to the end of the script plus settling and returns it. */
function afterMoves(
  match: MatchSetup,
  commands: readonly PlannedCommand[],
): { fork: MatchSetup; ticks: number } {
  const ticks = (commands[commands.length - 1]?.atTick ?? 0) + SETTLE_TICKS;
  const fork = forkMatch(match);
  let next = 0;
  for (let t = 0; t < ticks; t++) {
    while (next < commands.length && commands[next]!.atTick <= t) {
      fork.sim.enqueue(commands[next]!.command);
      next++;
    }
    fork.sim.step();
  }
  return { fork, ticks };
}

interface Options {
  samples: number;
  weights: ScoreWeights;
  profile: PersonalityProfile;
}

function shotsFrom(
  match: MatchSetup,
  teamId: string,
  opts: Options,
  noWind: boolean,
): ShotCandidate[] {
  return planWeaponShots(noWind ? withoutWind(match) : match, teamId, opts);
}

interface Position {
  match: MatchSetup;
  moves: PlannedCommand[];
  ticks: number;
  shots: ShotCandidate[];
}

/** Chooses between shooting from here and moving first, per difficulty and shot quality. */
function choosePosition(
  match: MatchSetup,
  teamId: string,
  diff: DifficultyProfile,
  opts: Options,
  rng: Rng,
  noWind: boolean,
): Position {
  const here: Position = {
    match,
    moves: [],
    ticks: 0,
    shots: shotsFrom(match, teamId, opts, noWind),
  };
  const roll = rng.next();
  const bestHere = here.shots[0]?.score ?? -Infinity;
  if (diff.movementCandidates <= 0 || bestHere >= ATTACK_THRESHOLD || roll >= diff.movementChance) {
    return here;
  }
  const plan = planMovement(match, teamId, {
    candidates: diff.movementCandidates,
    maxTicks: MOVE_TICKS,
    scorePosition: positionScore,
  });
  if (plan.commands.length === 0) return here;
  const { fork, ticks } = afterMoves(match, plan.commands);
  const shots = shotsFrom(fork, teamId, opts, noWind);
  return (shots[0]?.score ?? -Infinity) > bestHere
    ? { match: fork, moves: plan.commands, ticks, shots }
    : here;
}

/** Shot commands (aim then fire) for `cand` starting at `tick`, with aim noise per difficulty. */
function shotCommands(
  snailId: string,
  cand: ShotCandidate,
  tick: number,
  diff: DifficultyProfile,
  rng: Rng,
): PlannedCommand[] {
  let { angle, power, facing } = cand.aim;
  if (!cand.melee) {
    angle += gauss(rng) * diff.aimNoise.angle;
    facing += gauss(rng) * diff.aimNoise.angle;
    power *= 1 + gauss(rng) * diff.aimNoise.power;
  }
  power = Math.min(1, Math.max(0.02, power));
  return [
    { atTick: tick, command: { type: 'aim', snailId, angle, power, facing } },
    {
      atTick: tick + AIM_TO_FIRE_TICKS,
      command: { type: 'fire', snailId, weaponId: cand.weaponId },
    },
  ];
}

/**
 * Plans one whole turn for `teamId`'s active snail: optionally reposition (when no good shot
 * exists from here), choose the best weapon and target from the resulting spot, add Gaussian aim
 * noise and emit `move` commands, then `aim`, then `fire`. Mastermind additionally re-ranks its
 * top shots by the best predicted enemy reply. Retreat moves are not planned: they are only legal
 * in the retreat phase, whose start depends on projectile flight time. Deterministic for the same
 * match state and config; never mutates `match`.
 * @param match - Running match in the active team's action phase.
 * @param config - Difficulty, personality and seed.
 * @param teamId - Planning team.
 */
export function planTurnFor(match: MatchSetup, config: CpuConfig, teamId: string): TurnPlan {
  const { state } = match.sim;
  const snail = livingSnails(state).find((s) => s.id === state.turn.activeSnailId);
  if (!snail || snail.teamId !== teamId) return endTurnPlan(teamId, [], 0);
  const diff = DIFFICULTY_PROFILES[config.difficulty];
  const profile = PERSONALITY_PROFILES[config.personality];
  const opts: Options = { samples: diff.samples, weights: planWeights(profile), profile };
  const rng = turnRng(match, config.seed);
  const noWind = rng.next() < diff.ignoresWindChance;
  const pos = choosePosition(match, teamId, diff, opts, rng, noWind);
  let ranked = pos.shots;
  if (diff.lookahead && ranked.length > 1) {
    ranked = rerankByReply(pos.match, snail.id, ranked, LOOKAHEAD_COUNT, profile.caution);
  }
  const pick = ranked.length > 1 && rng.next() < diff.epsilon ? ranked[1] : ranked[0];
  if (!pick || pick.value < 0) return endTurnPlan(teamId, pos.moves, pos.ticks);
  return { commands: [...pos.moves, ...shotCommands(snail.id, pick, pos.ticks, diff, rng)] };
}
