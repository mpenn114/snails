import { applyDamage, kill, livingSnails } from '../entities/snail.js';
import type { Simulation } from '../sim/simulation.js';
import type { SimContext, SystemFn } from '../sim/types.js';
import type { Snail } from '../state/types.js';

/** Why a snail was hurt or killed by the environment. */
export type HazardCause = 'fall' | 'drown' | 'void';

/** Tunable environmental hazard parameters (metres). */
export interface HazardConfig {
  /** Free-fall height in metres that causes no damage. */
  safeFallDistance: number;
  /** Damage per metre fallen beyond `safeFallDistance`. */
  damagePerMetre: number;
  /** Cap on fall damage from a single landing. */
  maxFallDamage: number;
  /** Landings shorter than this (e.g. stepping off a lip) are ignored entirely. */
  minFallDistance: number;
  /** A snail whose centre is this far below the water level drowns (instant death). */
  drownDepth: number;
  /** Snails whose centre is below this world Y fall out of the world (instant death). */
  worldFloorY: number;
}

/** Default hazard configuration, from docs/game-design.md (fall damage section). */
export const DEFAULT_HAZARD_CONFIG: HazardConfig = {
  safeFallDistance: 3,
  damagePerMetre: 4,
  maxFallDamage: 40,
  minFallDistance: 0.5,
  drownDepth: 0,
  worldFloorY: 0,
};

/**
 * Damage for a landing after falling `fallDistance` metres. Zero up to the safe distance,
 * then `damagePerMetre` per extra metre, rounded to an integer and capped at `maxFallDamage`.
 * Non-numeric input yields 0.
 */
export function computeFallDamage(fallDistance: number, config: HazardConfig): number {
  if (!(fallDistance > config.safeFallDistance)) return 0;
  const raw = Math.round((fallDistance - config.safeFallDistance) * config.damagePerMetre);
  return Math.min(config.maxFallDamage, raw);
}

/**
 * Creates the hazard system. Runs after movement in the same step: resolves each pending
 * landing (fall damage), then kills living snails that are below the water (drowning) or
 * below the world floor. Dead snails are skipped.
 * Emits `snailDamaged` (with `cause: 'fall'`), `snailDrowned`, and `snailDied` (with `cause`).
 */
export function hazardSystem(config: HazardConfig = DEFAULT_HAZARD_CONFIG): SystemFn {
  return (ctx) => {
    for (const snail of livingSnails(ctx.state)) {
      applyPendingLanding(ctx, snail, config);
      if (snail.alive) applyEnvironment(ctx, snail, config);
    }
  };
}

/**
 * Registers the hazard system on a simulation. Add it after the movement system so that
 * landings are resolved in the same step they happen.
 */
export function registerHazards(
  sim: Simulation,
  config: HazardConfig = DEFAULT_HAZARD_CONFIG,
): void {
  sim.addSystem('hazards', hazardSystem(config));
}

function applyPendingLanding(ctx: SimContext, snail: Snail, cfg: HazardConfig): void {
  const landing = snail.pendingLanding;
  if (!landing) return;
  delete snail.pendingLanding;
  if (landing.fallDistance < cfg.minFallDistance) return;
  const amount = computeFallDamage(landing.fallDistance, cfg);
  if (amount <= 0) return;
  const result = applyDamage(snail, amount);
  if (result.dealt > 0) {
    ctx.emit({
      type: 'snailDamaged',
      snailId: snail.id,
      amount: result.dealt,
      remaining: snail.health,
      sourceSnailId: null,
      cause: 'fall',
    });
  }
  if (result.killed) emitDeath(ctx, snail, 'fall');
}

function applyEnvironment(ctx: SimContext, snail: Snail, cfg: HazardConfig): void {
  if (snail.position.y < ctx.state.terrain.waterLevel - cfg.drownDepth) {
    kill(snail);
    ctx.emit({ type: 'snailDrowned', snailId: snail.id });
    emitDeath(ctx, snail, 'drown');
    return;
  }
  if (snail.position.y < cfg.worldFloorY) {
    kill(snail);
    emitDeath(ctx, snail, 'void');
  }
}

function emitDeath(ctx: SimContext, snail: Snail, cause: HazardCause): void {
  ctx.emit({ type: 'snailDied', snailId: snail.id, teamId: snail.teamId, cause });
}
