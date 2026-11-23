/** Weapon fields the picker needs (structurally compatible with `WeaponDefinition`). */
export interface WeaponLike {
  id: string;
  name: string;
  ammo: number | 'infinite';
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
