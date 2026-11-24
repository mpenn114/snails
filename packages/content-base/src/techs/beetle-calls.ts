import type { TechnologyDefinition } from '@snails/core';

/** Beetle Calls: unlocks the Beetle Barrage (1 stock, +1 every 4 rounds). Needs Heavy Pebbles. */
export const beetleCalls = {
  id: 'beetle-calls',
  name: 'Beetle Calls',
  branch: 'weaponry',
  tier: 3,
  cost: 55,
  researchTurns: 2,
  prerequisites: ['heavy-pebbles'],
  description: 'Unlocks the Beetle Barrage (1 stock, +1 every 4 rounds).',
  effects: [{ type: 'grantStock', weaponId: 'base:beetle-barrage', amount: 1, everyRounds: 4 }],
} satisfies TechnologyDefinition;
