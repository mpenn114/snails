import type { TechnologyDefinition } from '@snails/core';

/** Regrowth: a snail that did not move since its last turn heals 5 HP at its turn start. */
export const regrowth = {
  id: 'regrowth',
  name: 'Regrowth',
  branch: 'shell',
  tier: 3,
  cost: 40,
  researchTurns: 1,
  prerequisites: ['calcified-shell'],
  description: 'Cracks mend: heals 5 HP per turn if the snail did not move.',
  effects: [{ type: 'modifyStat', stat: 'healPerStillTurn', op: 'add', value: 5 }],
  visual: { attachments: ['moss-patches'] },
} satisfies TechnologyDefinition;
