import { describe, expect, it } from 'vitest';
import { techInfo, weaponInfo } from './weapon-info';
import { needsCharge } from './weapon-list';

describe('weaponInfo', () => {
  it('reports damage, ammo and tech requirement', () => {
    const i = weaponInfo(
      {
        name: 'Beetle Barrage',
        category: 'special',
        ammo: 1,
        requiresTech: 'beetle-calls',
        effects: [
          {
            type: 'schedule',
            effects: [
              { type: 'carve', radius: 1 },
              { type: 'damage', maxDamage: 18 },
            ],
          },
        ],
        pattern: { count: 3 },
      },
      (id) => `Tech ${id}`,
    );
    expect(i.title).toBe('Beetle Barrage');
    expect(i.lines).toContain('Damage: up to 18 x 3 shells');
    expect(i.lines).toContain('Ammo: 1 per match');
    expect(i.lines).toContain('Needs research: Tech beetle-calls');
    expect(i.lines).toContain('Blasts a hole in the terrain');
  });
  it('unlimited ammo and no damage line without damage', () => {
    const i = weaponInfo({ name: 'Rope', category: 'utility', ammo: 'infinite', effects: [] });
    expect(i.lines).toContain('Ammo: unlimited');
    expect(i.lines.some((l) => l.startsWith('Damage'))).toBe(false);
  });
});

describe('techInfo', () => {
  it('shows description, cost and lock reason', () => {
    const i = techInfo({
      name: 'Heavy Pebbles',
      description: 'Bigger stones.',
      cost: 30,
      turns: 2,
      capstone: false,
      state: 'locked',
      reason: 'Needs Hop Training',
    });
    expect(i.lines).toEqual([
      'Bigger stones.',
      'Cost: 30 calcium, 2 turns',
      'Locked: Needs Hop Training',
    ]);
  });
});

describe('needsCharge', () => {
  it('melee and utilities fire without power', () => {
    expect(needsCharge({ category: 'projectile' })).toBe(true);
    expect(needsCharge({ category: 'melee' })).toBe(false);
    expect(needsCharge({ category: 'utility' })).toBe(false);
    expect(needsCharge(undefined)).toBe(false);
  });
});
