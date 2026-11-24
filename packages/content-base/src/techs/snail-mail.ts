import type { TechnologyDefinition } from '@snails/core';

/** Snail Mail (docs/technology-research.md): Unlocks Snail Mail teleport. */
export const snailMail: TechnologyDefinition = {
  id: 'snail-mail',
  name: 'Snail Mail',
  branch: 'utility',
  tier: 3,
  cost: 75,
  researchTurns: 2,
  prerequisites: ['egg-hunt'],
  description: 'Unlocks Snail Mail teleport.',
  effects: [
    {
      type: 'unlockWeapon',
      weaponId: 'base:snail-mail',
    },
  ],
};
