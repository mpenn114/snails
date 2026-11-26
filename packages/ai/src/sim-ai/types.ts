import {
  DEFAULT_TERRAIN_CONFIG,
  type ContentRegistries,
  type MatchOptions,
  type MatchSettingsInput,
  type MatchSetup,
  type TerrainStyle,
} from '@snails/core';

type TerrainGenConfigInput = NonNullable<MatchOptions['terrain']>;
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
  /**
   * Terrain style. Omitted keeps the legacy small island arena; a style uses the server's
   * default terrain config with that style.
   */
  style?: TerrainStyle;
  /** Called after every simulation step (read-only observation, e.g. for tests). */
  onStep?: (match: MatchSetup) => void;
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
  /** Deterministic work (predictImpact calls) spent by each `planTurn`. */
  planWork: number[];
}

/** How a match ended. */
export type AiEndReason = 'elimination' | 'research' | 'draw' | 'turnLimit';

/** Result of one headless AI match. Everything except `planTimesMs` is deterministic. */
export interface AiMatchRecord {
  seed: number;
  /** Terrain style played on (undefined for the legacy arena). */
  style?: TerrainStyle;
  /** Winning team index, or null for draws and turn limits. */
  winner: number | null;
  winnerConfig: AiTeamSpec | null;
  turns: number;
  endReason: AiEndReason;
  teams: AiTeamRecord[];
  errors: AiErrorRecord[];
  /** Snails that drowned (any cause: own move, knockback, water rise). */
  drownings: number;
  /** Drownings of snails nobody had hit before: the CPU (or a slide/fall) walked into the sea. */
  unprovokedDrownings: number;
  /** Turns that ended without any shot fired (the CPU did nothing useful). */
  idleTurns: number;
}

/**
 * Terrain config of a headless match: the legacy small island arena when `style` is omitted,
 * otherwise the server's default config with that style (what a real lobby plays on).
 */
export function aiTerrainConfig(style: TerrainStyle | undefined): TerrainGenConfigInput {
  return style === undefined
    ? { nx: 96, ny: 32, nz: 64, caveDensity: 0, islandFalloff: false }
    : { ...DEFAULT_TERRAIN_CONFIG, style };
}
