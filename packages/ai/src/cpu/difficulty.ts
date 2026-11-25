import type { Difficulty } from './types.js';

/** How one difficulty level plays ([ai.md](../../../../docs/ai.md) "Difficulty levels"). */
export interface DifficultyProfile {
  /** Gaussian standard deviation of aim error: `angle` in radians, `power` as a fraction. */
  aimNoise: { angle: number; power: number };
  /** Total `predictImpact` calls the aiming solver may spend per turn (split across weapons). */
  samples: number;
  /** Total deterministic work per turn (`predictImpact` calls over shots, moves-then-shots and replies). */
  thinkBudget: number;
  /** Chance (0..1) that the CPU plans its shot as if there were no wind. */
  ignoresWindChance: number;
  /** Candidate movement scripts simulated per turn (0 disables movement). */
  movementCandidates: number;
  /** Chance (0..1) of considering movement when the current spot offers no good shot. */
  movementChance: number;
  /** Chance (0..1) of taking the second-best shot for variety. */
  epsilon: number;
  /** Two-turn lookahead: weigh the best enemy reply to each of the top shots. */
  lookahead: boolean;
}

const DEG = Math.PI / 180;

/** Per-difficulty tuning (Regular is the docs' "Gardener" level). */
export const DIFFICULTY_PROFILES: Readonly<Record<Difficulty, DifficultyProfile>> = {
  rookie: {
    aimNoise: { angle: 2.5 * DEG, power: 0.04 },
    samples: 250,
    thinkBudget: 350,
    ignoresWindChance: 0.4,
    movementCandidates: 6,
    movementChance: 0.15,
    epsilon: 0.2,
    lookahead: false,
  },
  regular: {
    aimNoise: { angle: 2 * DEG, power: 0.04 },
    samples: 400,
    thinkBudget: 550,
    ignoresWindChance: 0,
    movementCandidates: 12,
    movementChance: 0.6,
    epsilon: 0.1,
    lookahead: false,
  },
  veteran: {
    aimNoise: { angle: 1.2 * DEG, power: 0.04 },
    samples: 450,
    thinkBudget: 600,
    ignoresWindChance: 0,
    movementCandidates: 12,
    movementChance: 1,
    epsilon: 0.05,
    lookahead: false,
  },
  mastermind: {
    aimNoise: { angle: 0.3 * DEG, power: 0.01 },
    samples: 520,
    thinkBudget: 480,
    ignoresWindChance: 0,
    movementCandidates: 14,
    movementChance: 1,
    epsilon: 0.02,
    lookahead: true,
  },
};
