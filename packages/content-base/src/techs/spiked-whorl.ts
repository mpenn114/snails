import type { TechnologyDefinition } from '@snails/core';

/** Spiked Whorl: melee attackers take 10 damage back; Shell Bash +30% damage. */
export const spikedWhorl = {
  id: 'spiked-whorl',
  name: 'Spiked Whorl',
  branch: 'shell',
  tier: 2,
  cost: 35,
  researchTurns: 2,
  prerequisites: ['calcified-shell'],
  description: 'Spikes: melee attackers take 10 damage; Shell Bash +30% damage.',
  effects: [
    { type: 'modifyStat', stat: 'meleeThorns', op: 'add', value: 10 },
    { type: 'modifyWeapon', weaponId: 'base:shell-bash', stat: 'damage', op: 'mul', value: 1.3 },
  ],
  visual: { attachments: ['spikes'] },
} satisfies TechnologyDefinition;
