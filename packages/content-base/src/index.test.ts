import { describe, expect, it } from 'vitest';
import { ContentRegistry } from '@snails/core';
import type { ShellUpgradeDefinition, TechnologyDefinition, WeaponDefinition } from '@snails/core';
import { registerBaseContent } from './index.js';

describe('registerBaseContent', () => {
  it('registers weapons, techs and shell upgrades', () => {
    const r = {
      weapons: new ContentRegistry<WeaponDefinition>(),
      technologies: new ContentRegistry<TechnologyDefinition>(),
      shellUpgrades: new ContentRegistry<ShellUpgradeDefinition>(),
    };
    registerBaseContent(r);
    expect(r.weapons.get('salt-bomb')?.name).toBe('Salt Bomb');
    expect(r.technologies.list()).toHaveLength(3);
    expect(r.shellUpgrades.get('iron-spiral')).toBeDefined();
    expect(() => registerBaseContent(r)).toThrow();
  });
});
