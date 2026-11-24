import type { ContentPack } from '@snails/core';
import { areas } from './areas.js';
import { crates } from './crates.js';
import { shellUpgrades } from './definitions.js';
import { technologies as baseTechs } from './techs/index.js';
import { mobilityUtilityTechnologies } from './techs/mobility-utility.js';
import { statuses } from './statuses/index.js';
import { weapons } from './weapons/index.js';
import { winds } from './winds.js';

const technologies = [...baseTechs, ...mobilityUtilityTechnologies];

export { areas, crates, shellUpgrades, statuses, technologies, weapons, winds };

/** The base content pack: load it with `loadContentPacks([basePack])`. */
export const basePack: ContentPack = {
  manifest: { id: 'base', name: 'Snails Base Content', version: '0.1.0' },
  weapons,
  technologies,
  shellUpgrades,
  crates,
  winds,
  statuses,
  areas,
};

/** Manifest of the base content pack. */
export const baseManifest = basePack.manifest;
