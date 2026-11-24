import { applyDamage, findSnail } from '../entities/snail.js';
import type { SimEvent } from '../sim/events.js';
import type { SimContext } from '../sim/types.js';
import type { GameState, Snail, Team } from '../state/types.js';
import type { TechRegistry } from './tech-rules.js';
import type { TechEffect, TechStat } from './research-types.js';

/**
 * Tech effect queries (docs/technology-research.md). Everything here is derived from
 * `team.researched` and the tech registry; nothing is cached, so there is no state to serialise.
 * One-time effects (heal, unlockWeapon, grantStock, max health) live in `tech-completion.ts`.
 */

type EffectOf<T extends TechEffect['type']> = Extract<TechEffect, { type: T }>;

/** Effects of every completed tech of `team`, in completion order. */
export function completedEffects(team: Team | undefined, techs?: TechRegistry): TechEffect[] {
  if (!team || !techs) return [];
  const out: TechEffect[] = [];
  for (const id of team.researched) out.push(...(techs.get(id)?.effects ?? []));
  return out;
}

function effectsOfType<T extends TechEffect['type']>(
  state: GameState,
  techs: TechRegistry | undefined,
  teamId: string,
  type: T,
): EffectOf<T>[] {
  const team = state.teams.find((t) => t.id === teamId);
  return completedEffects(team, techs).filter((e): e is EffectOf<T> => e.type === type);
}

function applyOps(base: number, ops: { op: 'add' | 'mul'; value: number }[]): number {
  let v = base;
  for (const o of ops) if (o.op === 'add') v += o.value;
  for (const o of ops) if (o.op === 'mul') v *= o.value;
  return v;
}

/**
 * Value of `stat` for a team: `base`, plus every completed `modifyStat` `add`, then times every
 * `mul` (adds first, so `add 1` and `mul 2` on base 3 give 8 whatever the research order).
 * Multiplier-like stats (damage taken/dealt, jump distance) use base 1; others use the natural
 * value as the call site documents. Without a registry the base is returned. `maxHealth` is a
 * one-time completion effect (see `tech-completion.ts`); do not query it here.
 */
export function teamStat(
  state: GameState,
  techs: TechRegistry | undefined,
  teamId: string,
  stat: TechStat,
  base: number,
): number {
  const ops = effectsOfType(state, techs, teamId, 'modifyStat').filter((e) => e.stat === stat);
  return applyOps(base, ops);
}

/**
 * Value of a weapon's `damage` or `radius` for a team after its completed `modifyWeapon`
 * effects for that weapon (adds first, then muls).
 */
export function weaponModifier(
  state: GameState,
  techs: TechRegistry | undefined,
  teamId: string,
  weaponId: string,
  stat: 'damage' | 'radius',
  base: number,
): number {
  const ops = effectsOfType(state, techs, teamId, 'modifyWeapon').filter(
    (e) => e.weaponId === weaponId && e.stat === stat,
  );
  return applyOps(base, ops);
}

/** True when a completed tech of the team sets `flag`. */
export function teamHasFlag(
  state: GameState,
  techs: TechRegistry | undefined,
  teamId: string,
  flag: string,
): boolean {
  return effectsOfType(state, techs, teamId, 'setFlag').some((e) => e.flag === flag);
}

/** True when a completed tech of the team adds `abilityId`. */
export function teamHasAbility(
  state: GameState,
  techs: TechRegistry | undefined,
  teamId: string,
  abilityId: string,
): boolean {
  return effectsOfType(state, techs, teamId, 'addAbility').some((e) => e.abilityId === abilityId);
}

/** A `hook` effect implementation: sees every sim event, for a team that completed the tech. */
export type TechHook = (ctx: SimContext, event: SimEvent, teamId: string) => void;

const hooks = new Map<string, TechHook>();

/** Registers (or replaces) the implementation of `hookId`; content packs call this at load. */
export function registerTechHook(hookId: string, fn: TechHook): void {
  hooks.set(hookId, fn);
}

/** The implementation registered for `hookId`, if any. */
export function lookupTechHook(hookId: string): TechHook | undefined {
  return hooks.get(hookId);
}

/** Removes a hook (tests). */
export function unregisterTechHook(hookId: string): void {
  hooks.delete(hookId);
}

/** Calls every hook of every completed tech, per team, for one event (an event observer). */
export function dispatchTechHooks(ctx: SimContext, event: SimEvent): void {
  if (!ctx.techs) return;
  for (const team of ctx.state.teams) {
    for (const e of completedEffects(team, ctx.techs)) {
      if (e.type === 'hook') hooks.get(e.hookId)?.(ctx, event, team.id);
    }
  }
}

/** Damage multiplier of the explosion pipeline for one hit (dealer stats times victim stats). */
export function hitDamageMultiplier(
  ctx: SimContext,
  dealerTeamId: string | undefined,
  victimTeamId: string,
  melee: boolean,
): number {
  const { state, techs } = ctx;
  let m = teamStat(state, techs, victimTeamId, 'blastDamageTaken', 1);
  if (dealerTeamId === undefined) return m;
  m *= teamStat(state, techs, dealerTeamId, 'damageDealt', 1);
  if (melee) m *= teamStat(state, techs, dealerTeamId, 'meleeDamage', 1);
  return m;
}

/** Damage multiplier for `victim` hit by a source (looks up the dealer's team). */
export function sourceHitMultiplier(
  ctx: SimContext,
  victim: Snail,
  ownerSnailId: string,
  melee: boolean,
): number {
  if (!ctx.techs) return 1;
  const dealer = findSnail(ctx.state, ownerSnailId)?.teamId;
  return hitDamageMultiplier(ctx, dealer, victim.teamId, melee);
}

/**
 * `meleeThorns`: a melee attacker that damaged `victim` takes the victim team's thorns damage
 * back (once per struck snail), emitting `snailDamaged` / `snailDied` like any explosion damage.
 */
export function applyMeleeThorns(ctx: SimContext, victim: Snail, attackerId: string): void {
  if (!ctx.techs) return;
  const thorns = Math.round(teamStat(ctx.state, ctx.techs, victim.teamId, 'meleeThorns', 0));
  const attacker = findSnail(ctx.state, attackerId);
  if (thorns <= 0 || !attacker?.alive) return;
  const result = applyDamage(attacker, thorns);
  if (result.dealt > 0) {
    ctx.emit({
      type: 'snailDamaged',
      snailId: attacker.id,
      amount: result.dealt,
      remaining: attacker.health,
      sourceSnailId: victim.id,
      cause: 'explosion',
    });
  }
  if (result.killed) {
    ctx.emit({
      type: 'snailDied',
      snailId: attacker.id,
      teamId: attacker.teamId,
      cause: 'explosion',
    });
  }
}

/**
 * Great Spiral: Citadel (`citadelShield` flag): a snail at full health ignores the first hit of
 * each turn. Returns true (and records the turn on the snail) when this hit is absorbed.
 */
export function consumeCitadelShield(ctx: SimContext, snail: Snail): boolean {
  if (!ctx.techs || snail.health < snail.maxHealth) return false;
  if (snail.shieldTurn === ctx.state.turn.turnNumber) return false;
  if (!teamHasFlag(ctx.state, ctx.techs, snail.teamId, 'citadelShield')) return false;
  snail.shieldTurn = ctx.state.turn.turnNumber;
  return true;
}
