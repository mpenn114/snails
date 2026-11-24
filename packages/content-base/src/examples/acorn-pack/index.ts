import type { ContentPack } from '@snails/core';
import { acornMortar } from './acorn-mortar.js';

export { acornMortar };

/** Example third-party pack: depends on `base` and adds one weapon, no code beyond data. */
export const acornPack: ContentPack = {
  manifest: {
    id: 'acorn',
    name: 'Acorn Pack',
    version: '1.0.0',
    dependencies: { base: '^0.1.0' },
  },
  weapons: [acornMortar],
};
