import type { TechnologyDefinition } from '@snails/core';
import { beetleCalls } from './beetle-calls.js';
import { calcifiedShell } from './calcified-shell.js';
import { crystalLattice } from './crystal-lattice.js';
import { heavyPebbles } from './heavy-pebbles.js';
import { ironPlating } from './iron-plating.js';
import { radulaGuidance } from './radula-guidance.js';
import { regrowth } from './regrowth.js';
import { saltMining } from './salt-mining.js';
import { spikedWhorl } from './spiked-whorl.js';
import { stickySlime } from './sticky-slime.js';

/**
 * Base-game technologies in tree order: Weaponry, Shell and Armour, then the other branches.
 * To add a tech: create `techs/<id>.ts` exporting a `satisfies TechnologyDefinition` constant,
 * import it above and list it here. Research turns: tier 1 = 1, tier 2 = 2, tier 3 = 2 to 3.
 */
export const technologies: TechnologyDefinition[] = [
  // Weaponry
  saltMining,
  stickySlime,
  heavyPebbles,
  radulaGuidance,
  beetleCalls,
  // Shell and Armour
  calcifiedShell,
  spikedWhorl,
  ironPlating,
  crystalLattice,
  regrowth,
];
