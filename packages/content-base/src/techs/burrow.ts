import type { TechnologyDefinition } from '@snails/core';

/** Burrow (docs/technology-research.md): Once per match, retreat underground and resurface up to 10 m away next turn (ability data only). */
export const burrow: TechnologyDefinition = {
  id: 'burrow',
  name: 'Burrow',
  branch: 'mobility',
  tier: 3,
  cost: 55,
  researchTurns: 2,
  prerequisites: ['hop-training'],
  description:
    'Once per match, retreat underground and resurface up to 10 m away next turn (ability data only).',
  effects: [
    {
      type: 'addAbility',
      abilityId: 'burrow',
    },
  ],
};
