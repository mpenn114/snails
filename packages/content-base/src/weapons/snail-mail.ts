import type { WeaponDefinition } from '@snails/core';

/**
 * Snail Mail: utility, no damage. The shot marks where it lands; at the next turn start the
 * firing snail is posted there (`move` effect, teleport). The arrival point is telegraphed
 * with a warning ring until then. Needs the `snail-mail` technology.
 */
export const snailMail = {
  id: 'base:snail-mail',
  name: 'Snail Mail',
  category: 'utility',
  launch: { minSpeed: 3, maxSpeed: 18, gravityScale: 1, windScale: 0.3, projectileRadius: 0.15 },
  fuseSeconds: 0,
  effects: [
    {
      type: 'schedule',
      turns: 1,
      telegraph: { radius: 0.9, style: 'arrival' },
      effects: [{ type: 'move', mode: 'teleport', lift: 0.5 }],
    },
  ],
  ammo: 1,
  requiresTech: 'snail-mail',
} satisfies WeaponDefinition;
