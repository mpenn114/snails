import type { ContentRegistries, MatchSettingsInput } from '@snails/core';
import type { Difficulty, Personality } from '../cpu/types.js';

/** One CPU team's skill and style in an AI match. */
export interface AiTeamSpec {
  difficulty: Difficulty;
  personality: Personality;
}

/** Options of one headless AI match. */
export interface AiMatchOptions {
  registries: ContentRegistries;
  seed: number;
  /** Two to four CPU teams, in turn order. */
  teams: AiTeamSpec[];
  snailsPerTeam?: number;
  /** Hard cap on turns (default 60). */
  turnCap?: number;
  settings?: MatchSettingsInput;
}

/** An error thrown by a CPU during a match (the match carries on by ending the turn). */
export interface AiErrorRecord {
  turn: number;
  teamIndex: number;
  where: 'planTurn' | 'planResearch' | 'stall';
  message: string;
}

/** Per-team result of an AI match. */
export interface AiTeamRecord extends AiTeamSpec {
  index: number;
  teamId: string;
  shotsFired: number;
  damageDealt: number;
  kills: number;
  techsResearched: string[];
  /** Wall-clock `planTurn` durations in milliseconds (not deterministic). */
  planTimesMs: number[];
}

/** How a match ended. */
export type AiEndReason = 'elimination' | 'research' | 'draw' | 'turnLimit';

/** Result of one headless AI match. Everything except `planTimesMs` is deterministic. */
export interface AiMatchRecord {
  seed: number;
  /** Winning team index, or null for draws and turn limits. */
  winner: number | null;
  winnerConfig: AiTeamSpec | null;
  turns: number;
  endReason: AiEndReason;
  teams: AiTeamRecord[];
  errors: AiErrorRecord[];
}
