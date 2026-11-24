import type { Command, MatchSetup } from '@snails/core';
import { planCpuResearch } from '../research/cpu-research.js';
import { planTurnFor } from './brain.js';
import { PERSONALITY_PROFILES } from './personalities.js';
import type { CpuConfig, CpuOptions, CpuPlayer, TurnPlan } from './types.js';

/** Turn-planning CPU: weapon choice per situation and difficulty levels (see `brain.ts`). */
class PlannerCpu implements CpuPlayer {
  constructor(
    readonly config: CpuConfig,
    private readonly options: CpuOptions,
  ) {}

  planTurn(match: MatchSetup, teamId: string): TurnPlan {
    return planTurnFor(match, this.config, teamId, this.options);
  }

  planResearch(match: MatchSetup, teamId: string): Command[] {
    const profile = PERSONALITY_PROFILES[this.config.personality];
    return planCpuResearch(match, teamId, profile, this.config.difficulty);
  }
}

/**
 * Creates the CPU player for `config`.
 * @param config - Difficulty, personality and seed.
 * @param options - Optional emergency limits such as `deadlineMs` (see {@link CpuOptions}).
 */
export function createCpuPlayer(config: CpuConfig, options: CpuOptions = {}): CpuPlayer {
  return new PlannerCpu(config, options);
}
