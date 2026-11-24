import type { TechnologyDefinition } from '@snails/core';

/** Crystal Lattice: during the retreat after a shot the shell blocks 80% of damage, and 10% of the damage of a projectile that hits it is reflected to the firer. */
export const crystalLattice = {
  id: 'crystal-lattice',
  name: 'Crystal Lattice',
  branch: 'shell',
  tier: 3,
  cost: 85,
  researchTurns: 3,
  prerequisites: ['iron-plating'],
  description: 'Crystal shell: retreat blocks 80% damage; reflects 10% of projectile damage.',
  effects: [
    { type: 'modifyStat', stat: 'retreatDamageTaken', op: 'mul', value: 0.2 },
    { type: 'modifyStat', stat: 'projectileReflect', op: 'add', value: 0.1 },
  ],
  visual: { shellMaterial: 'crystal', glow: 'crystal-veins' },
} satisfies TechnologyDefinition;
