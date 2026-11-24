import type { WeaponDefinition } from '@snails/core';

/**
 * Shell Drill: a spinning bit that tunnels 8 m along the aimed direction (motion `drill`),
 * carving a tube 1.6 m wide at constant speed with gravity and wind off. Terrain-only runs deal
 * no damage; touching a snail stops the drill and deals a flat 10. The carve power (20) is
 * below rock's threshold (30), so rock stops the drill silently; clay, soil and sand are cut.
 */
export const shellDrill = {
  id: 'base:shell-drill',
  name: 'Shell Drill',
  category: 'digger',
  launch: { minSpeed: 12, maxSpeed: 12, gravityScale: 0, windScale: 0, projectileRadius: 0.25 },
  fuseSeconds: 0,
  motion: { kind: 'drill', length: 8, tubeRadius: 0.8, power: 20 },
  effects: [{ type: 'damage', radius: 0.8, maxDamage: 10, knockback: 3, falloff: 'flat' }],
  ammo: 'infinite',
} satisfies WeaponDefinition;
