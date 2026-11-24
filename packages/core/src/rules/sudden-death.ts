import { roundOf } from '../crate/crate-drop.js';
import { applyDamage, livingSnails } from '../entities/snail.js';
import type { Simulation } from '../sim/simulation.js';
import type { SimContext } from '../sim/types.js';
import { skipTurnIfActiveDead } from '../turn/turn-hooks.js';

/** Sudden-death rules (a subset of the match settings). */
export interface SuddenDeathRules {
  /** First round of sudden death. */
  startRound: number;
  /** What happens each round. */
  kind: 'water' | 'drain' | 'both';
  /** Metres the water rises per round (`water`, `both`). */
  waterRisePerRound: number;
  /** Rounds over which maximum health falls to 1 (`drain`, `both`). */
  drainRounds: number;
}

/** Defaults: round 20, both effects, 1 m of water per round, 5 rounds of drain. */
export const DEFAULT_SUDDEN_DEATH_RULES: SuddenDeathRules = {
  startRound: 20,
  kind: 'both',
  waterRisePerRound: 1,
  drainRounds: 5,
};

/** True on the first turn of a round (every team's turn counts, dead teams included). */
function firstOfRound(ctx: SimContext, turnNumber: number): boolean {
  return (turnNumber - 1) % Math.max(1, ctx.state.teams.length) === 0;
}

/** Water rises a share of the per-round amount each turn start, capped at the world top. */
function raiseWater(ctx: SimContext, rules: SuddenDeathRules): void {
  const t = ctx.state.terrain;
  const top = t.ny * t.cellSize;
  const delta = rules.waterRisePerRound / Math.max(1, ctx.state.teams.length);
  const level = Math.min(top, t.waterLevel + delta);
  if (level <= t.waterLevel) return;
  t.waterLevel = level;
  ctx.emit({ type: 'waterRose', level, delta });
}

/** Lowers every living snail's maximum health by `step` (never below 1), clamping health. */
function drainHealth(ctx: SimContext, step: number): void {
  for (const snail of livingSnails(ctx.state)) {
    snail.maxHealth = Math.max(1, snail.maxHealth - step);
    const excess = snail.health - snail.maxHealth;
    if (excess <= 0) continue;
    const result = applyDamage(snail, excess);
    ctx.emit({
      type: 'snailDamaged',
      snailId: snail.id,
      amount: result.dealt,
      remaining: snail.health,
      sourceSnailId: null,
      cause: 'suddenDeath',
    });
  }
}

function begin(ctx: SimContext, rules: SuddenDeathRules, round: number): void {
  const drains = rules.kind !== 'water';
  const highest = Math.max(1, ...ctx.state.teams.flatMap((t) => t.snails.map((s) => s.maxHealth)));
  ctx.state.suddenDeath = {
    startRound: round,
    drainStep: drains ? Math.ceil((highest - 1) / Math.max(1, rules.drainRounds)) : 0,
  };
  ctx.emit({ type: 'suddenDeathStarted', round, kind: rules.kind });
}

/**
 * Turn-start hook body: from `startRound` on, the water rises every turn start and maximum
 * health falls at every round start (both depending on `kind`). Announces the start once with
 * `suddenDeathStarted`. Deterministic: no randomness.
 */
export function suddenDeathAtTurnStart(
  ctx: SimContext,
  rules: SuddenDeathRules,
  turnNumber: number,
): void {
  const round = roundOf(ctx.state);
  if (round < rules.startRound) return;
  if (!ctx.state.suddenDeath) begin(ctx, rules, round);
  const sd = ctx.state.suddenDeath;
  if (rules.kind !== 'drain') raiseWater(ctx, rules);
  if (sd && sd.drainStep > 0 && firstOfRound(ctx, turnNumber)) drainHealth(ctx, sd.drainStep);
  skipTurnIfActiveDead(ctx);
}

/**
 * Registers the `sudden-death` turn-start hook. Register it last, after crates, so its order is
 * statuses, areas, scheduled, crates, sudden death.
 */
export function registerSuddenDeath(sim: Simulation, rules: SuddenDeathRules): void {
  sim.registerTurnStartHook('sudden-death', (ctx, info) =>
    suddenDeathAtTurnStart(ctx, rules, info.turnNumber),
  );
}
