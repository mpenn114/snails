import { ContentRegistry } from './registry.js';
import {
  AreaSchema,
  CrateSchema,
  ShellUpgradeSchema,
  StatusSchema,
  TechnologySchema,
  WeaponSchema,
  WindSchema,
} from './schemas.js';
import type {
  AreaDefinition,
  CrateDefinition,
  ShellUpgradeDefinition,
  StatusDefinition,
  TechnologyDefinition,
  WeaponDefinition,
  WindDefinition,
} from './types.js';

/**
 * The set of content registries a content pack registers into. To add a content kind: add a
 * field here, a line in {@link createContentRegistries}, and (optionally) a cross-reference
 * check in `pack-validation.ts`. Packs use the same field names.
 */
export interface ContentRegistries {
  weapons: ContentRegistry<WeaponDefinition>;
  technologies: ContentRegistry<TechnologyDefinition>;
  shellUpgrades: ContentRegistry<ShellUpgradeDefinition>;
  crates: ContentRegistry<CrateDefinition>;
  winds: ContentRegistry<WindDefinition>;
  statuses: ContentRegistry<StatusDefinition>;
  areas: ContentRegistry<AreaDefinition>;
}

/** Creates a fresh, empty set of validating content registries. */
export function createContentRegistries(): ContentRegistries {
  return {
    weapons: new ContentRegistry('weapon', WeaponSchema),
    technologies: new ContentRegistry('technology', TechnologySchema),
    shellUpgrades: new ContentRegistry('shellUpgrade', ShellUpgradeSchema),
    crates: new ContentRegistry('crate', CrateSchema),
    winds: new ContentRegistry('wind', WindSchema),
    statuses: new ContentRegistry('status', StatusSchema),
    areas: new ContentRegistry('area', AreaSchema),
  };
}
