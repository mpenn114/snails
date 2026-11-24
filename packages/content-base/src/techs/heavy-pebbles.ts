import type { TechnologyDefinition } from '@snails/core';

/** Heavy Pebbles: Pebble Toss hits 25% harder and wider. Needs Salt Mining or Sticky Slime. */
export const heavyPebbles = {
  id: 'heavy-pebbles',
  name: 'Heavy Pebbles',
  branch: 'weaponry',
  tier: 2,
  cost: 35,
  researchTurns: 2,
  prerequisites: [],
  anyOf: ['salt-mining', 'sticky-slime'],
  description: 'Pebble Toss +25% damage and radius.',
  effects: [
    { type: 'modifyWeapon', weaponId: 'base:pebble-toss', stat: 'damage', op: 'mul', value: 1.25 },
    { type: 'modifyWeapon', weaponId: 'base:pebble-toss', stat: 'radius', op: 'mul', value: 1.25 },
  ],
} satisfies TechnologyDefinition;
