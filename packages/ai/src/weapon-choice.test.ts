import { describe, expect, it } from 'vitest';
import type { WeaponDefinition } from '@snails/core';
import { chooseWeapon } from './weapon-choice.js';

const w = (id: string, over: Partial<WeaponDefinition>): WeaponDefinition =>
  ({ id, category: 'projectile', ammo: 'infinite', ...over }) as WeaponDefinition;

const ROPE = w('rope', { category: 'utility', ammo: 3 });
const ALL = [
  ROPE,
  w('gated', { category: 'projectile', ammo: 3, requiresTech: 't' }),
  w('toss', { category: 'projectile', ammo: 'infinite' }),
  w('roller', { category: 'bouncing', ammo: 2 }),
];

describe('chooseWeapon', () => {
  it('skips locked weapons and picks the best available', () => {
    const team = { inventory: { rope: 3, gated: 3, roller: 2 }, researched: [] };
    expect(chooseWeapon(team, ALL)?.id).toBe('toss');
  });

  it('prefers a researched, stocked finite projectile over a plain one only by score', () => {
    const team = { inventory: { rope: 3, gated: 3, roller: 2 }, researched: ['t'] };
    expect(chooseWeapon(team, ALL)?.id).toBe('toss');
    expect(chooseWeapon({ ...team, inventory: { toss: 0, gated: 3 } }, ALL)?.id).toBe('gated');
  });

  it('skips empty stock and returns null when nothing is usable', () => {
    const team = { inventory: { rope: 0, toss: 0, roller: 0, gated: 0 }, researched: ['t'] };
    expect(chooseWeapon(team, ALL)).toBeNull();
    expect(chooseWeapon({ inventory: { rope: 1 }, researched: [] }, [ROPE])?.id).toBe('rope');
  });
});
