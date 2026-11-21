import type { ExplosionSpec } from '../physics/explosion.js';

/** Kind of weapon, which selects how it is aimed and released. */
export type WeaponKind = 'projectile' | 'thrown' | 'utility';

/** Launch parameters that drive projectile motion for a weapon. */
export interface WeaponLaunchSpec {
  /** Minimum launch speed in m/s (power at zero charge). */
  minSpeed: number;
  /** Maximum launch speed in m/s (power at full charge). */
  maxSpeed: number;
  /** Multiplier applied to world gravity for this projectile. */
  gravityScale: number;
  /** Multiplier applied to wind acceleration for this projectile. */
  windScale: number;
  /** Projectile collision radius in metres. */
  projectileRadius: number;
}

/**
 * Definition of a weapon. Fully data-driven: the sim reads launch, fuse and
 * explosion parameters from here without weapon-specific code.
 */
export interface WeaponDefinition {
  /** Content id in the form `pack:kebab-name`, e.g. `base:salt-bomb`. */
  id: string;
  /** Display name. */
  name: string;
  /** Kind of weapon. */
  kind: WeaponKind;
  /** Projectile launch parameters. */
  launch: WeaponLaunchSpec;
  /** Fuse in seconds for timed weapons; 0 = explode on impact. */
  fuseSeconds: number;
  /** Explosion produced when the weapon detonates. */
  explosion: ExplosionSpec;
  /** Number of uses per match, or `'infinite'`. */
  ammo: number | 'infinite';
  /** Technology id required to unlock; undefined = available from the start. */
  requiresTech?: string;
}

/** Definition of a research technology node. */
export interface TechnologyDefinition {
  id: string;
  name: string;
  branch: 'weaponry' | 'shell' | 'mobility' | 'utility';
  tier: number;
  cost: number;
  prerequisites: string[];
  description: string;
}

/** Definition of a shell upgrade. */
export interface ShellUpgradeDefinition {
  id: string;
  name: string;
  /** Flat damage reduction applied to incoming damage. */
  armor: number;
  /** Visual material hint for the renderer. */
  material: string;
  requiresTech?: string;
}

/** Manifest describing a content pack. */
export interface ContentPackManifest {
  id: string;
  name: string;
  version: string;
  author?: string;
  dependencies?: string[];
}
