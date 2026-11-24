import { describe, expect, it } from 'vitest';
import {
  buildWeaponTiles,
  defaultWeaponId,
  resolveSelection,
  stockFor,
  weaponBlock,
  type InventoryView,
  type WeaponLike,
} from './weapon-list';

const WEAPONS: WeaponLike[] = [
  { id: 'rocket', name: 'Rocket', ammo: 3, category: 'projectile' },
  { id: 'pebble', name: 'Pebble', ammo: 'infinite', category: 'projectile' },
  { id: 'beetle', name: 'Beetle', ammo: 1, category: 'area' },
];

const inv = (
  stock: Record<string, number>,
  locked: Record<string, string> = {},
): InventoryView => ({ stock, locked });

describe('stock and blocks', () => {
  it('uses counted stock, infinity for uncounted infinite weapons, 0 for uncounted finite', () => {
    const v = inv({ rocket: 2 });
    expect(stockFor(WEAPONS[0] as WeaponLike, v)).toBe(2);
    expect(stockFor(WEAPONS[1] as WeaponLike, v)).toBe(Infinity);
    expect(stockFor(WEAPONS[2] as WeaponLike, v)).toBe(0);
  });

  it('falls back to the definition before any inventory arrives', () => {
    expect(stockFor(WEAPONS[0] as WeaponLike, null)).toBe(3);
    expect(weaponBlock(WEAPONS[0] as WeaponLike, null)).toBeNull();
  });

  it('prefers the lock over empty stock', () => {
    const v = inv({}, { beetle: 'beetle-callers' });
    expect(weaponBlock(WEAPONS[2] as WeaponLike, v)).toBe('locked');
    expect(weaponBlock(WEAPONS[0] as WeaponLike, v)).toBe('empty');
  });
});

describe('tiles', () => {
  const v = inv({ rocket: 0, beetle: 1 }, { beetle: 'beetle-callers' });
  const tiles = buildWeaponTiles(WEAPONS, 'rocket', true, v);

  it('shows counts, infinity and locks with reasons', () => {
    expect(tiles.map((t) => t.ammoLabel)).toEqual(['0', '∞', 'Locked']);
    expect(tiles[2]?.reason).toBe('Needs beetle-callers');
    expect(tiles[0]?.reason).toBe('Out of ammo');
    expect(tiles[1]?.reason).toBe('');
  });

  it('greys out empty and locked tiles and never marks them selected', () => {
    expect(tiles.map((t) => t.disabled)).toEqual([true, false, true]);
    expect(tiles[0]?.selected).toBe(false);
  });

  it('disables everything off-turn but keeps the usable selection', () => {
    const off = buildWeaponTiles(WEAPONS, 'pebble', false, v);
    expect(off.every((t) => t.disabled)).toBe(true);
    expect(off[1]?.selected).toBe(true);
  });
});

describe('selection fallback', () => {
  it('keeps a usable selection', () => {
    expect(resolveSelection(WEAPONS, 'rocket', inv({ rocket: 1 }))).toBe('rocket');
  });

  it('falls back to the plain infinite projectile when stock hits zero', () => {
    expect(resolveSelection(WEAPONS, 'rocket', inv({ rocket: 0 }))).toBe('pebble');
  });

  it('falls back when the selected weapon is locked or unknown, or nothing is selected', () => {
    const locked = inv({ beetle: 1 }, { beetle: 't' });
    expect(resolveSelection(WEAPONS, 'beetle', locked)).toBe('pebble');
    expect(resolveSelection(WEAPONS, 'nope', null)).toBe('pebble');
    expect(resolveSelection(WEAPONS, null, null)).toBe('pebble');
  });

  it('default skips gated and empty weapons and returns null for no weapons', () => {
    expect(defaultWeaponId(WEAPONS, inv({}))).toBe('pebble');
    expect(defaultWeaponId([WEAPONS[0] as WeaponLike], inv({ rocket: 2 }))).toBe('rocket');
    expect(defaultWeaponId([], null)).toBeNull();
  });
});
