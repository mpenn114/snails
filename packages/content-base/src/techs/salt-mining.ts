import type { TechnologyDefinition } from '@snails/core';

/** Salt Mining: unlocks the Salt Shaker with 3 in stock. */
export const saltMining = {
  id: 'salt-mining',
  name: 'Salt Mining',
  branch: 'weaponry',
  tier: 1,
  cost: 20,
  researchTurns: 1,
  prerequisites: [],
  description: 'Unlocks the Salt Shaker (3 stock).',
  effects: [{ type: 'unlockWeapon', weaponId: 'base:salt-shaker', stock: 3 }],
} satisfies TechnologyDefinition;
