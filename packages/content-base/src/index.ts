import type {
  ContentPackManifest,
  ContentRegistry,
  ShellUpgradeDefinition,
  TechnologyDefinition,
  WeaponDefinition,
} from '@snails/core';
import { shellUpgrades, technologies, weapons } from './definitions.js';

export { shellUpgrades, technologies, weapons };

/** Manifest of the base content pack. */
export const baseManifest: ContentPackManifest = {
  id: 'base',
  name: 'Snails Base Content',
  version: '0.1.0',
};

/** Registries a content pack registers into. */
export interface ContentRegistries {
  weapons: ContentRegistry<WeaponDefinition>;
  technologies: ContentRegistry<TechnologyDefinition>;
  shellUpgrades: ContentRegistry<ShellUpgradeDefinition>;
}

/** Registers all base-game content into the given registries. */
export function registerBaseContent(registries: ContentRegistries): void {
  weapons.forEach((w) => registries.weapons.register(w));
  technologies.forEach((t) => registries.technologies.register(t));
  shellUpgrades.forEach((s) => registries.shellUpgrades.register(s));
}
