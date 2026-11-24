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

/** One picker tile. */
export interface WeaponTile {
  id: string;
  name: string;
  /** Placeholder icon: first letter of the name. */
  icon: string;
  ammoLabel: string;
  selected: boolean;
  disabled: boolean;
}

/** Builds picker tiles; everything is disabled when it is not my turn. */
export function buildWeaponTiles(
  weapons: readonly WeaponLike[],
  selectedId: string | null,
  myTurn: boolean,
): WeaponTile[] {
  return weapons.map((w) => ({
    id: w.id,
    name: w.name,
    icon: w.name.charAt(0).toUpperCase(),
    ammoLabel: w.ammo === 'infinite' ? '∞' : String(w.ammo),
    selected: w.id === selectedId,
    disabled: !myTurn || w.ammo === 0,
  }));
}
