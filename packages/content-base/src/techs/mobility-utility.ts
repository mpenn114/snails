import type { TechnologyDefinition } from '@snails/core';
import { lubricatedFoot } from './lubricated-foot.js';
import { stickyClimb } from './sticky-climb.js';
import { hopTraining } from './hop-training.js';
import { slimeRope } from './slime-rope.js';
import { burrow } from './burrow.js';
import { eyeStalkOptics } from './eye-stalk-optics.js';
import { weatherVane } from './weather-vane.js';
import { eggHunt } from './egg-hunt.js';
import { scoutingMist } from './scouting-mist.js';
import { snailMail } from './snail-mail.js';
import { greatSpiralArsenal } from './great-spiral-arsenal.js';
import { greatSpiralCitadel } from './great-spiral-citadel.js';
import { greatSpiralGlide } from './great-spiral-glide.js';
import { greatSpiralOracle } from './great-spiral-oracle.js';
import './arsenal-hook.js';

/** Mobility, Utility and Intel techs plus the four Great Spiral capstones, in tree order. */
export const mobilityUtilityTechnologies: TechnologyDefinition[] = [
  lubricatedFoot,
  stickyClimb,
  hopTraining,
  slimeRope,
  burrow,
  eyeStalkOptics,
  weatherVane,
  eggHunt,
  scoutingMist,
  snailMail,
  greatSpiralArsenal,
  greatSpiralCitadel,
  greatSpiralGlide,
  greatSpiralOracle,
];
