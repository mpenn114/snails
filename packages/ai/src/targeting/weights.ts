/** Tunable weights of target and impact scoring (personalities adjust these). */
export interface ScoreWeights {
  /** Multiplier on damage dealt to enemies. */
  aggression: number;
  /** Multiplier on self and ally risk. */
  caution: number;
  /** Flat bonus per enemy kill. */
  killBonus: number;
  /** Extra target value factor for the snail that hit us last (e.g. factor 1.2). */
  revenge?: { snailId: string; factor: number };
}

/** Neutral weights. */
export const DEFAULT_WEIGHTS: ScoreWeights = { aggression: 1, caution: 1, killBonus: 50 };
