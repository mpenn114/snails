import type { TechnologyDefinition } from '@snails/core';

/** Egg Hunt (docs/technology-research.md): +5 Calcium per turn; crate locations revealed in fog. */
export const eggHunt: TechnologyDefinition = {
  id: 'egg-hunt',
  name: 'Egg Hunt',
  branch: 'utility',
  tier: 2,
  cost: 35,
  researchTurns: 2,
  prerequisites: ['weather-vane'],
  description: '+5 Calcium per turn; crate locations revealed in fog.',
  effects: [
    {
      type: 'modifyStat',
      stat: 'calciumPerTurn',
      op: 'add',
      value: 5,
    },
    {
      type: 'setFlag',
      flag: 'seeCrates',
    },
  ],
};
