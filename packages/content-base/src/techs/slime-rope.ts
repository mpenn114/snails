import type { TechnologyDefinition } from '@snails/core';

/** Slime Rope (docs/technology-research.md): Unlocks the Slime Rope tool. */
export const slimeRope: TechnologyDefinition = {
  id: 'slime-rope',
  name: 'Slime Rope',
  branch: 'mobility',
  tier: 2,
  cost: 45,
  researchTurns: 2,
  prerequisites: ['sticky-climb'],
  description: 'Unlocks the Slime Rope tool.',
  effects: [
    {
      type: 'unlockWeapon',
      weaponId: 'base:slime-rope',
    },
  ],
  visual: { attachments: ['rope-coil'] },
};
