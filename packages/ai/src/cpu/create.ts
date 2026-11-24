import type { Command, MatchSetup } from '@snails/core';
import { planTurnFor } from './brain.js';
import type { CpuConfig, CpuPlayer, TurnPlan } from './types.js';

/** Turn-planning CPU: weapon choice per situation and difficulty levels (see `brain.ts`). */
class PlannerCpu implements CpuPlayer {
  constructor(readonly config: CpuConfig) {}

  planTurn(match: MatchSetup, teamId: string): TurnPlan {
    return planTurnFor(match, this.config, teamId);
  }

  planResearch(): Command[] {
    return [];
  }
}

/** Creates the CPU player for `config`. */
export function createCpuPlayer(config: CpuConfig): CpuPlayer {
  return new PlannerCpu(config);
}
