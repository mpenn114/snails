import type { Command, MatchSetup } from '@snails/core';

/** CPU skill levels, weakest first ([ai.md](../../../../docs/ai.md)). */
export const DIFFICULTIES = ['rookie', 'regular', 'veteran', 'mastermind'] as const;
/** A CPU skill level. */
export type Difficulty = (typeof DIFFICULTIES)[number];

/** CPU play styles. */
export const PERSONALITIES = ['aggressive', 'cautious', 'opportunist'] as const;
/** A CPU play style. */
export type Personality = (typeof PERSONALITIES)[number];

/** How one CPU team plays. */
export interface CpuConfig {
  difficulty: Difficulty;
  personality: Personality;
  /** Seed for the CPU's own RNG (aim noise, tie breaks); same seed and state give the same plan. */
  seed: number;
}

/** One command, issued `atTick` fixed ticks after the plan starts (non-decreasing). */
export interface PlannedCommand {
  atTick: number;
  command: Command;
}

/**
 * A whole turn for the active snail: typically moves (held `move` then `direction: 0`), an `aim`,
 * then a `fire`, optionally followed by retreat moves. A plan with no `fire` should end with an
 * `endTurn`. Commands target only the planning team's active snail.
 */
export interface TurnPlan {
  commands: PlannedCommand[];
  /** Deterministic work spent planning (`predictImpact` calls); absent for non-planner CPUs. */
  work?: number;
}

/** Runtime options of a CPU player (they do not change what a plan is, only emergency limits). */
export interface CpuOptions {
  /**
   * Wall-clock emergency cutoff per turn in milliseconds (default: none). The deterministic work
   * budget is the primary limiter; when this deadline fires the plan can depend on machine speed,
   * so leave it unset in tests and the AI runner.
   */
  deadlineMs?: number;
}

/** A CPU player. It reads the match but never mutates it; lookahead works on forks. */
export interface CpuPlayer {
  readonly config: CpuConfig;
  /** Plans the turn of `teamId`, which must be the active team in the `action` phase. */
  planTurn(match: MatchSetup, teamId: string): TurnPlan;
  /** Research commands (`queueResearch` / `cancelResearch`) for `teamId` to issue now; may be empty. */
  planResearch(match: MatchSetup, teamId: string): Command[];
}
