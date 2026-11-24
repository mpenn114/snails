import type { WeaponDefinition } from '@snails/core';

/**
 * Slime Rope: a sticky strand shot straight along the aim at 40 m/s with a 0.3 s fuse (about
 * 12 m of reach). If it touches terrain, the `reel` effect pulls the firer to 0.9 m off the
 * surface over 0.7 s, then drops it. In open air the strand fizzles. One use per turn, and it
 * does not end the action phase (`endsAction: false`), so the snail can still shoot after
 * climbing. Replaces jumping for reaching ledges.
 */
export const slimeRope = {
  id: 'base:slime-rope',
  name: 'Slime Rope',
  category: 'utility',
  launch: { minSpeed: 40, maxSpeed: 40, gravityScale: 0, windScale: 0, projectileRadius: 0.15 },
  fuseSeconds: 0.3,
  effects: [{ type: 'reel', seconds: 0.7, standoff: 0.9 }],
  ammo: 'infinite',
  perTurn: 1,
  requiresTech: 'slime-rope',
  endsAction: false,
} satisfies WeaponDefinition;
