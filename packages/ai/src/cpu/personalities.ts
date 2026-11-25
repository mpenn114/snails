import type { Personality } from './types.js';

/** Tunable weights and build order of one CPU personality (data, so mods can add more). */
export interface PersonalityProfile {
  /** Multiplier on enemy damage and kills when scoring shots. */
  aggression: number;
  /** Multiplier on self and ally damage risk when scoring shots and choosing positions. */
  caution: number;
  /** Bonus per expected kill. */
  killBonus: number;
  /** Weight on crates and Calcium when choosing where to go. */
  greed: number;
  /** Value multiplier on whoever last hit this team. */
  revenge: number;
  /** Fraction of health the CPU will risk on self damage when the shot kills. */
  selfRiskTolerance: number;
  /** Chance of retreating after a shot (0..1). */
  retreatChance: number;
  /**
   * Preferred research order by tech id without pack prefix (`salt-mining` matches
   * `base:salt-mining`); invalid or unaffordable entries are skipped.
   */
  buildOrder: readonly string[];
}

/** Built-in personalities ([ai.md](../../../../docs/ai.md) "Personalities"). */
export const PERSONALITY_PROFILES: Readonly<Record<Personality, PersonalityProfile>> = {
  aggressive: {
    aggression: 1.4,
    caution: 0.6,
    killBonus: 70,
    greed: 0.5,
    revenge: 1.3,
    selfRiskTolerance: 0.25,
    retreatChance: 0.2,
    buildOrder: [
      'salt-mining',
      'sticky-slime',
      'heavy-pebbles',
      'lubricated-foot',
      'spiked-whorl',
      'beetle-calls',
      'great-spiral-arsenal',
    ],
  },
  cautious: {
    aggression: 0.9,
    caution: 1.6,
    killBonus: 40,
    greed: 0.7,
    revenge: 1.1,
    selfRiskTolerance: 0.05,
    retreatChance: 0.9,
    buildOrder: [
      'calcified-shell',
      'iron-plating',
      'regrowth',
      'weather-vane',
      'crystal-lattice',
      'great-spiral-citadel',
    ],
  },
  opportunist: {
    aggression: 1.1,
    caution: 1.0,
    killBonus: 60,
    greed: 1.5,
    revenge: 1.2,
    selfRiskTolerance: 0.15,
    retreatChance: 0.5,
    buildOrder: [
      'weather-vane',
      'eye-stalk-optics',
      'egg-hunt',
      'calcified-shell',
      'scouting-mist',
      'snail-mail',
      'great-spiral-oracle',
    ],
  },
};
