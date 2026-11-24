import type { TechnologyDefinition } from '@snails/core';

/** Calcified Shell: +15 max health. Max and current health rise together, so it also heals 15 now. */
export const calcifiedShell = {
  id: 'calcified-shell',
  name: 'Calcified Shell',
  branch: 'shell',
  tier: 1,
  cost: 25,
  researchTurns: 1,
  prerequisites: [],
  description: 'The shell calcifies: +15 max health, healing 15 now.',
  effects: [{ type: 'modifyStat', stat: 'maxHealth', op: 'add', value: 15 }],
  visual: { shellMaterial: 'calcified' },
} satisfies TechnologyDefinition;
