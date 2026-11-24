import type { TechnologyDefinition } from '@snails/core';

/** Iron Plating: -20% blast damage and +10 max health. */
export const ironPlating = {
  id: 'iron-plating',
  name: 'Iron Plating',
  branch: 'shell',
  tier: 2,
  cost: 50,
  researchTurns: 2,
  prerequisites: ['calcified-shell'],
  description: 'Iron shell: -20% blast damage, +10 max health.',
  effects: [
    { type: 'modifyStat', stat: 'blastDamageTaken', op: 'mul', value: 0.8 },
    { type: 'modifyStat', stat: 'maxHealth', op: 'add', value: 10 },
  ],
  visual: { shellMaterial: 'iron', attachments: ['plating-light'] },
} satisfies TechnologyDefinition;
