import type { TechnologyDefinition } from '@snails/core';

/** Great Spiral: Glide (docs/technology-research.md): No fall damage and a long move budget (+10 s); one rope per turn. */
export const greatSpiralGlide: TechnologyDefinition = {
  id: 'great-spiral-glide',
  name: 'Great Spiral: Glide',
  branch: 'mobility',
  tier: 4,
  cost: 150,
  researchTurns: 3,
  prerequisites: [],
  anyOf: ['burrow'],
  capstone: true,
  description: 'No fall damage and a long move budget (+10 s); one rope per turn.',
  effects: [
    {
      type: 'modifyStat',
      stat: 'fallDamageTaken',
      op: 'mul',
      value: 0,
    },
    {
      type: 'modifyStat',
      stat: 'moveBudgetSeconds',
      op: 'add',
      value: 10,
    },
  ],
  visual: { attachments: ['wings'] },
};
