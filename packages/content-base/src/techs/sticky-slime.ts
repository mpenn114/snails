import type { TechnologyDefinition } from '@snails/core';

/** Sticky Slime: unlocks the Slime Grenade and widens its burst by 0.5 m. */
export const stickySlime = {
  id: 'sticky-slime',
  name: 'Sticky Slime',
  branch: 'weaponry',
  tier: 1,
  cost: 25,
  researchTurns: 1,
  prerequisites: [],
  description: 'Unlocks the Slime Grenade; its burst radius +0.5 m.',
  effects: [
    { type: 'unlockWeapon', weaponId: 'base:slime-grenade' },
    { type: 'modifyWeapon', weaponId: 'base:slime-grenade', stat: 'radius', op: 'add', value: 0.5 },
  ],
} satisfies TechnologyDefinition;
