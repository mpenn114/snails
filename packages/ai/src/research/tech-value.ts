import type { GameState, TechEffect, TechnologyDefinition, Team } from '@snails/core';

/** Relative worth of one unit of change per stat (unknown stats fall back to 1). */
const STAT_WEIGHT: Readonly<Record<string, number>> = {
  maxHealth: 1.2,
  blastDamageTaken: 1.6,
  damageDealt: 1.8,
  moveBudgetSeconds: 0.8,
  crawlSpeed: 0.6,
  maxClimbDegrees: 0.5,
  jumpCharges: 0.7,
  jumpDistance: 0.6,
  calciumPerTurn: 1.4,
  meleeDamage: 0.6,
  meleeThorns: 0.5,
  retreatDamageTaken: 0.6,
  projectileReflect: 0.8,
  healPerStillTurn: 0.9,
  stockBonus: 0.6,
  fallDamageTaken: 0.4,
};

/** Typical magnitude of an additive change per stat, used to normalise `add` values. */
const ADD_SCALE: Readonly<Record<string, number>> = {
  maxHealth: 100,
  moveBudgetSeconds: 10,
  maxClimbDegrees: 30,
  calciumPerTurn: 3,
};

/**
 * Value of one effect on a roughly 0 to 2 scale. Generic over the closed effect vocabulary, so
 * modded techs with unknown stat combinations are valued from their modifiers too.
 */
export function effectValue(effect: TechEffect): number {
  switch (effect.type) {
    case 'modifyStat': {
      const w = STAT_WEIGHT[effect.stat] ?? 1;
      // Stats that are "taken" (damage taken, fall damage) are better when lowered.
      const lower = effect.stat.endsWith('Taken');
      if (effect.op === 'mul') return w * (lower ? 1 - effect.value : effect.value - 1);
      return (w * (lower ? -1 : 1) * effect.value) / (ADD_SCALE[effect.stat] ?? 5);
    }
    case 'modifyWeapon':
      return effect.op === 'mul' ? 1.5 * (effect.value - 1) : effect.value / 20;
    case 'unlockWeapon':
      return 2;
    case 'grantStock':
      return 0.4 + 0.1 * effect.amount * (effect.everyRounds ? 2 : 1);
    case 'heal':
      return effect.amount / 50;
    case 'addAbility':
      return 1;
    case 'setFlag':
    case 'hook':
      return 0.8;
  }
}

/** Summed value of a tech; a pure gate with no effects is still worth a little. */
export function techValue(def: TechnologyDefinition): number {
  const sum = (def.effects ?? []).reduce((acc, e) => acc + Math.max(0, effectValue(e)), 0);
  return Math.max(0.15, sum) * (1 + 0.25 * def.tier) * (def.capstone ? 1.5 : 1);
}

/** Does `def` reduce incoming blast damage (an armour tech)? */
export function isArmourTech(def: TechnologyDefinition | undefined): boolean {
  return (def?.effects ?? []).some(
    (e) =>
      e.type === 'modifyStat' && e.stat === 'blastDamageTaken' && e.op === 'mul' && e.value < 1,
  );
}

/** Does `def` raise damage in a way armour does not stop (weapon or damage-dealt boosts)? */
export function isDamageTech(def: TechnologyDefinition): boolean {
  return (def.effects ?? []).some(
    (e) =>
      (e.type === 'modifyWeapon' && e.stat === 'damage') ||
      (e.type === 'modifyStat' && e.stat === 'damageDealt'),
  );
}

/** Does `def` set `flag`? */
export function setsFlag(def: TechnologyDefinition | undefined, flag: string): boolean {
  return (def?.effects ?? []).some((e) => e.type === 'setFlag' && e.flag === flag);
}

/** What a team can see about its opponents' research. */
export interface OpponentView {
  /** Tech ids opponents finished (always visible), plus queued ones with `seeOpponentResearch`. */
  visibleTechIds: string[];
  /** Whether an opponent has a scouting tech (it can see our research). */
  scouting: boolean;
}

/**
 * Opponent research visible to `team`. Finished techs are public; queued and active work is
 * visible only to a team that finished a tech setting the `seeOpponentResearch` flag (mirrors the
 * server's privacy filter).
 */
export function opponentView(
  state: GameState,
  team: Team,
  lookup: (id: string) => TechnologyDefinition | undefined,
): OpponentView {
  const sees = team.researched.some((id) => setsFlag(lookup(id), 'seeOpponentResearch'));
  const ids: string[] = [];
  let scouting = false;
  for (const other of state.teams) {
    if (other.id === team.id) continue;
    ids.push(...other.researched);
    if (other.researched.some((id) => setsFlag(lookup(id), 'seeOpponentResearch'))) scouting = true;
    if (sees && other.research) {
      ids.push(...other.research.queue);
      if (other.research.active) ids.push(other.research.active.techId);
    }
  }
  return { visibleTechIds: ids, scouting };
}
