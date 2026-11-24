import type { TechnologyDefinition } from '@snails/core';

/** Great Spiral: Arsenal (docs/technology-research.md): Weapons deal +20% and every stock +1. */
export const greatSpiralArsenal: TechnologyDefinition = {
  id: 'great-spiral-arsenal',
  name: 'Great Spiral: Arsenal',
  branch: 'weaponry',
  tier: 4,
  cost: 150,
  researchTurns: 3,
  prerequisites: [],
  anyOf: ['beetle-calls'],
  capstone: true,
  description: 'Weapons deal +20% and every stock +1.',
  effects: [
    {
      type: 'modifyStat',
      stat: 'damageDealt',
      op: 'mul',
      value: 1.2,
    },
    {
      type: 'modifyStat',
      stat: 'stockBonus',
      op: 'add',
      value: 1,
    },
    {
      type: 'hook',
      hookId: 'great-spiral-arsenal',
    },
  ],
  visual: { glow: 'spiral-gold' },
};
