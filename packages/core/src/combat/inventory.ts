import type { Team } from '../state/types.js';

/** The weapon fields the inventory rules read (structurally a subset of `WeaponDefinition`). */
export interface StockedWeapon {
  id: string;
  ammo: number | 'infinite';
  requiresTech?: string | undefined;
}

/** Why a weapon cannot be fired right now, or `ok`. */
export type WeaponAvailability = 'ok' | 'NO_AMMO' | 'WEAPON_LOCKED';

/**
 * Builds a team's starting inventory: every finite weapon gets its `ammo` (or the `loadout`
 * override for that id); infinite weapons are not counted. Tech-gated weapons start with no
 * stock (the tech's `unlockWeapon` grants it) unless a `loadout` entry says otherwise.
 */
export function initialInventory(
  weapons: readonly StockedWeapon[],
  loadout: Readonly<Record<string, number>> = {},
): Record<string, number> {
  const inv: Record<string, number> = {};
  for (const w of weapons) {
    const override = loadout[w.id];
    if (override !== undefined) inv[w.id] = Math.max(0, Math.floor(override));
    else if (w.ammo !== 'infinite' && w.requiresTech === undefined) inv[w.id] = w.ammo;
  }
  return inv;
}

/** Stock of `weapon` for `team`: `Infinity` for infinite weapons that have no override. */
export function stockOf(team: Pick<Team, 'inventory'>, weapon: StockedWeapon): number {
  const counted = team.inventory?.[weapon.id];
  if (counted !== undefined) return counted;
  return weapon.ammo === 'infinite' ? Number.POSITIVE_INFINITY : 0;
}

/** True when the team has not researched the technology the weapon requires. */
export function isWeaponLocked(
  team: Pick<Team, 'researched'>,
  weapon: Pick<StockedWeapon, 'requiresTech'>,
): boolean {
  return weapon.requiresTech !== undefined && !team.researched.includes(weapon.requiresTech);
}

/** Whether `team` may fire `weapon`: locked weapons first, then empty stock. */
export function weaponAvailability(
  team: Pick<Team, 'inventory' | 'researched'>,
  weapon: StockedWeapon,
): WeaponAvailability {
  if (isWeaponLocked(team, weapon)) return 'WEAPON_LOCKED';
  return stockOf(team, weapon) > 0 ? 'ok' : 'NO_AMMO';
}

/** Spends one use of `weapon` (no-op for uncounted infinite weapons). */
export function consumeStock(team: Pick<Team, 'inventory'>, weapon: StockedWeapon): void {
  const inv = team.inventory;
  const have = inv?.[weapon.id];
  if (inv && have !== undefined) inv[weapon.id] = Math.max(0, have - 1);
}
