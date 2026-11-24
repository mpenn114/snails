import { heal } from '../entities/snail.js';
import type { SimContext } from '../sim/types.js';
import type { Team } from '../state/types.js';
import type { TechRegistry } from './tech-rules.js';
import { teamStat } from './tech-effects.js';
import type { TechEffect } from './research-types.js';

/**
 * One-time tech effects, applied by an event observer on `researchCompleted`
 * (`registerResearch`), plus the repeating `grantStock` schedule (team turn start).
 */

/** Stock to add for a finite grant of `count`, including the team's `stockBonus`. */
export function stockGrantAmount(ctx: SimContext, teamId: string, count: number): number {
  if (count <= 0) return 0;
  return count + Math.round(teamStat(ctx.state, ctx.techs, teamId, 'stockBonus', 0));
}

function addStock(ctx: SimContext, team: Team, weaponId: string, count: number): void {
  const inv = (team.inventory ??= {});
  inv[weaponId] = (inv[weaponId] ?? 0) + stockGrantAmount(ctx, team.id, count);
}

function raiseMaxHealth(team: Team, e: Extract<TechEffect, { type: 'modifyStat' }>): void {
  for (const s of team.snails) {
    const delta = e.op === 'add' ? e.value : Math.round(s.maxHealth * (e.value - 1));
    s.maxHealth += delta;
    if (s.alive) s.health = Math.max(1, Math.min(s.maxHealth, s.health + delta));
  }
}

/** Stable key of a repeating grant in `research.stockTimers`. */
function timerKey(techId: string, index: number): string {
  return `${techId}:${index}`;
}

/**
 * Applies the one-time effects of a just-completed tech: `heal` (living snails, capped at max),
 * `modifyStat maxHealth` (max and current raised together), `unlockWeapon` (stock `stock`, else
 * the weapon's own ammo, finite only) and `grantStock` (now; with `everyRounds` it also starts
 * a timer in `research.stockTimers`, counted in the team's own turns, one per round).
 */
export function applyCompletionEffects(
  ctx: SimContext,
  team: Team,
  techId: string,
  techs: TechRegistry,
  weaponAmmo: (weaponId: string) => number | 'infinite' | undefined,
): void {
  const effects = techs.get(techId)?.effects ?? [];
  effects.forEach((e, i) => {
    if (e.type === 'heal') {
      for (const s of team.snails) heal(s, e.amount);
    } else if (e.type === 'modifyStat' && e.stat === 'maxHealth') {
      raiseMaxHealth(team, e);
    } else if (e.type === 'unlockWeapon') {
      const ammo = weaponAmmo(e.weaponId);
      const count = e.stock ?? (typeof ammo === 'number' ? ammo : 0);
      if (count > 0) addStock(ctx, team, e.weaponId, count);
    } else if (e.type === 'grantStock') {
      addStock(ctx, team, e.weaponId, e.amount);
      if (e.everyRounds !== undefined && team.research) {
        (team.research.stockTimers ??= {})[timerKey(techId, i)] = 0;
      }
    }
  });
}

/** Team turn start: advances repeating `grantStock` timers and grants when one comes due. */
export function tickStockGrants(ctx: SimContext, teamId: string | null): void {
  const team = ctx.state.teams.find((t) => t.id === teamId);
  const timers = team?.research?.stockTimers;
  if (!team || !timers || !ctx.techs) return;
  for (const techId of team.researched) {
    (ctx.techs.get(techId)?.effects ?? []).forEach((e, i) => {
      const key = timerKey(techId, i);
      const n = timers[key];
      if (e.type !== 'grantStock' || e.everyRounds === undefined || n === undefined) return;
      timers[key] = n + 1 >= e.everyRounds ? 0 : n + 1;
      if (n + 1 >= e.everyRounds) addStock(ctx, team, e.weaponId, e.amount);
    });
  }
}
