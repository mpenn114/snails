/** Weapon fields the picker needs (structurally compatible with `WeaponDefinition`). */
export interface WeaponLike {
  id: string;
  name: string;
  ammo: number | 'infinite';
  /** Motion kind lets the controls know a weapon is guided (joystick steers it in flight). */
  motion?: { kind: string } | undefined;
  /** Weapon category: melee weapons need no power, utilities (rope) are not attacks. */
  category?: string | undefined;
}

/** Label of the fire button for a weapon: melee strikes, utilities are used, others fire. */
export function fireLabel(weapon: Pick<WeaponLike, 'category'> | undefined): string {
  if (weapon?.category === 'melee') return 'Bash';
  if (weapon?.category === 'utility') return 'Use';
  return 'Fire';
}

/** A team's stock and locks as sent by the server's `inventory` message. */
export interface InventoryView {
  /** Uses left per finite weapon; infinite weapons are absent. */
  stock: Readonly<Record<string, number>>;
  /** Locked weapons, `weaponId -> required technology id`. */
  locked: Readonly<Record<string, string>>;
}

/** Why a weapon cannot be picked. */
export type WeaponBlock = 'locked' | 'empty' | null;

/**
 * Stock of a weapon: `Infinity` for infinite weapons, the counted stock otherwise (0 when the
 * team has none). Before any inventory arrives the definition's starting `ammo` is shown.
 */
export function stockFor(weapon: WeaponLike, inv: InventoryView | null): number {
  if (!inv) return weapon.ammo === 'infinite' ? Infinity : weapon.ammo;
  const counted = inv.stock[weapon.id];
  if (counted !== undefined) return counted;
  return weapon.ammo === 'infinite' ? Infinity : 0;
}

/** Whether a weapon is unusable right now: tech-locked first, then out of stock. */
export function weaponBlock(weapon: WeaponLike, inv: InventoryView | null): WeaponBlock {
  if (inv && inv.locked[weapon.id] !== undefined) return 'locked';
  return stockFor(weapon, inv) > 0 ? null : 'empty';
}

/** The weapon selected by default: an unlimited, ungated projectile (else the first usable). */
export function defaultWeaponId(
  weapons: readonly WeaponLike[],
  inv: InventoryView | null,
): string | null {
  const usable = weapons.filter((w) => weaponBlock(w, inv) === null);
  const plain = usable.find((w) => w.ammo === 'infinite' && w.category === 'projectile');
  return (plain ?? usable[0] ?? weapons[0])?.id ?? null;
}

/**
 * Resolves the selection: keeps `selectedId` while it is usable, otherwise falls back to the
 * default weapon (also when nothing is selected yet).
 */
export function resolveSelection(
  weapons: readonly WeaponLike[],
  selectedId: string | null,
  inv: InventoryView | null,
): string | null {
  const current = weapons.find((w) => w.id === selectedId);
  if (current && weaponBlock(current, inv) === null) return current.id;
  return defaultWeaponId(weapons, inv);
}

/** One picker tile. */
export interface WeaponTile {
  id: string;
  name: string;
  /** Placeholder icon: first letter of the name. */
  icon: string;
  /** Stock label: `∞`, the count, or `Locked`. */
  ammoLabel: string;
  selected: boolean;
  disabled: boolean;
  /** Why the weapon is greyed out, when it is. */
  block: WeaponBlock;
  /** Human reason for a locked or empty weapon (tooltip), else ''. */
  reason: string;
}

function blockReason(block: WeaponBlock, tech: string | undefined): string {
  if (block === 'locked') return `Needs ${tech ?? 'research'}`;
  return block === 'empty' ? 'Out of ammo' : '';
}

/**
 * Builds picker tiles with stock counts. Empty or locked weapons are disabled (and never
 * shown as selected); everything is disabled when it is not my turn.
 */
export function buildWeaponTiles(
  weapons: readonly WeaponLike[],
  selectedId: string | null,
  myTurn: boolean,
  inv: InventoryView | null = null,
): WeaponTile[] {
  return weapons.map((w) => {
    const block = weaponBlock(w, inv);
    const stock = stockFor(w, inv);
    return {
      id: w.id,
      name: w.name,
      icon: w.name.charAt(0).toUpperCase(),
      ammoLabel: block === 'locked' ? 'Locked' : stock === Infinity ? '∞' : String(stock),
      selected: w.id === selectedId && block === null,
      disabled: !myTurn || block !== null,
      block,
      reason: blockReason(block, inv?.locked[w.id]),
    };
  });
}
