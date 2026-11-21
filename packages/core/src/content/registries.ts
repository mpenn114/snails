import { ContentRegistry } from './registry.js';
import type { ShellUpgradeDefinition, TechnologyDefinition, WeaponDefinition } from './types.js';

/** The set of content registries a content pack registers into. */
export interface ContentRegistries {
  weapons: ContentRegistry<WeaponDefinition>;
  technologies: ContentRegistry<TechnologyDefinition>;
  shellUpgrades: ContentRegistry<ShellUpgradeDefinition>;
}

/** Creates a fresh, empty set of content registries. */
export function createContentRegistries(): ContentRegistries {
  return {
    weapons: new ContentRegistry<WeaponDefinition>(),
    technologies: new ContentRegistry<TechnologyDefinition>(),
    shellUpgrades: new ContentRegistry<ShellUpgradeDefinition>(),
  };
}
