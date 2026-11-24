import type { ContentPack } from '@snails/core';
import { crates } from './crates.js';
import { shellUpgrades, technologies } from './definitions.js';
import { statuses } from './statuses/index.js';
import { weapons } from './weapons/index.js';
import { winds } from './winds.js';

export { crates, shellUpgrades, statuses, technologies, weapons, winds };

/** The base content pack: load it with `loadContentPacks([basePack])`. */
export const basePack: ContentPack = {
  manifest: { id: 'base', name: 'Snails Base Content', version: '0.1.0' },
  weapons,
  technologies,
  shellUpgrades,
  crates,
  winds,
  statuses,
};

/** Manifest of the base content pack. */
export const baseManifest = basePack.manifest;
