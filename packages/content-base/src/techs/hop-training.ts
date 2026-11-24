import type { TechnologyDefinition } from '@snails/core';

/** Hop Training (docs/technology-research.md): +1 jump charge (a mid-air jump); jumps 30% longer. */
export const hopTraining: TechnologyDefinition = {
  id: 'hop-training',
  name: 'Hop Training',
  branch: 'mobility',
  tier: 2,
  cost: 35,
  researchTurns: 2,
  prerequisites: ['lubricated-foot'],
  description: '+1 jump charge (a mid-air jump); jumps 30% longer.',
  effects: [
    {
      type: 'modifyStat',
      stat: 'jumpCharges',
      op: 'add',
      value: 1,
    },
    {
      type: 'modifyStat',
      stat: 'jumpDistance',
      op: 'mul',
      value: 1.3,
    },
  ],
};
