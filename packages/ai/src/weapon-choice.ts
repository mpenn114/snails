import { weaponAvailability, type Team, type WeaponDefinition } from '@snails/core';

/** Generic preference per weapon category: direct-damage shooters first, utility last. */
const CATEGORY_SCORE: Readonly<Record<string, number>> = {
  projectile: 5,
  thrown: 4,
  bouncing: 4,
  guided: 4,
  area: 3,
  special: 2,
  digger: 1,
  melee: 1,
  utility: 0,
};

/** Generic score of a weapon: category preference plus a bonus for plain, immediate shots. */
export function scoreWeapon(weapon: WeaponDefinition): number {
  const base = CATEGORY_SCORE[weapon.category] ?? 0;
  return weapon.ammo === 'infinite' ? base + 0.5 : base;
}

/**
 * Picks the weapon a CPU snail fires: the highest scoring weapon the team can actually use now
 * (researched and in stock, per `weaponAvailability`), ties broken by definition order so the
 * choice is deterministic. Returns `null` when nothing is available.
 */
export function chooseWeapon(
  team: Pick<Team, 'inventory' | 'researched'>,
  weapons: readonly WeaponDefinition[],
): WeaponDefinition | null {
  let best: WeaponDefinition | null = null;
  for (const w of weapons) {
    if (weaponAvailability(team, w) !== 'ok') continue;
    if (best === null || scoreWeapon(w) > scoreWeapon(best)) best = w;
  }
  return best;
}
