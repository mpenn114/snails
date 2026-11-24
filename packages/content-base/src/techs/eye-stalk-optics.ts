import type { TechnologyDefinition } from '@snails/core';

/** Eye Stalk Optics (docs/technology-research.md): Aim preview shows the full arc with wind. */
export const eyeStalkOptics: TechnologyDefinition = {
  id: 'eye-stalk-optics',
  name: 'Eye Stalk Optics',
  branch: 'utility',
  tier: 1,
  cost: 20,
  researchTurns: 1,
  prerequisites: [],
  description: 'Aim preview shows the full arc with wind.',
  effects: [
    {
      type: 'setFlag',
      flag: 'fullAimPreview',
    },
  ],
  visual: { attachments: ['eye-stalks'] },
};
