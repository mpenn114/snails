import type { TechnologyDefinition } from '@snails/core';

/** Radula Guidance: unlocks the Radula Missile with 2 in stock. Needs Sticky Slime. */
export const radulaGuidance = {
  id: 'radula-guidance',
  name: 'Radula Guidance',
  branch: 'weaponry',
  tier: 2,
  cost: 35,
  researchTurns: 2,
  prerequisites: ['sticky-slime'],
  description: 'Unlocks the Radula Missile (2 stock).',
  effects: [{ type: 'unlockWeapon', weaponId: 'base:radula-missile', stock: 2 }],
} satisfies TechnologyDefinition;
