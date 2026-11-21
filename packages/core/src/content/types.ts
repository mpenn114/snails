/** Definition of a weapon. */
export interface WeaponDefinition {
  id: string;
  name: string;
  kind: 'projectile' | 'thrown' | 'utility';
  damage: number;
  blastRadius: number;
  /** Muzzle speed in world units per second. */
  speed: number;
  /** Fuse in seconds for timed weapons; 0 = explode on impact. */
  fuseSeconds: number;
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
