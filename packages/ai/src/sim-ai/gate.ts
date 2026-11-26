import {
  loadContentPacks,
  TERRAIN_STYLES,
  type ContentRegistries,
  type TerrainStyle,
} from '@snails/core';
import { basePack } from '@snails/content-base';
import { PERSONALITIES } from '../cpu/types.js';
import { runAiMatch } from './run-match.js';
import { formatStyleTable, formatSummary, runAiMatches, summarize } from './summary.js';
import { thinkTimeStats } from './think-time.js';
import type { AiMatchRecord, AiTeamSpec } from './types.js';

/** Thresholds and sizes of the AI regression gate. */
export interface AiGateOptions {
  registries?: ContentRegistries;
  /** Mastermind vs Rookie matches on the legacy arena (default 30). */
  matches?: number;
  /** Terrain styles of the style sweep (default: every style; 0 `styleMatches` skips it). */
  styles?: readonly TerrainStyle[];
  /** Matches per style in the sweep (default 6; the server's real terrain config). */
  styleMatches?: number;
  /** Minimum Mastermind win rate over the sweep (default 0.75: new styles are harder to read). */
  styleMinWinRate?: number;
  startSeed?: number;
  snailsPerTeam?: number;
  turnCap?: number;
  /** Minimum Mastermind win rate (default 0.9). */
  minWinRate?: number;
  /** Allowed share of turn-limit stalemates (default 0.05). */
  maxStalemateRate?: number;
  /** Wall-clock p99 ceiling of any planTurn in ms (default 1000, generous for noisy CI). */
  maxP99Ms?: number;
  /** Matches of the 4-team smoke test (default 3; 0 skips it). */
  smokeMatches?: number;
}

/** Result of the gate. */
export interface AiGateResult {
  passed: boolean;
  report: string;
  /** One line per violated check, with seeds to reproduce. */
  failures: string[];
}

/** Thresholds checked by {@link evaluateGate}. */
export interface GateThresholds {
  minWinRate: number;
  maxStalemateRate: number;
  maxP99Ms: number;
}

/** Default gate thresholds. */
export const DEFAULT_THRESHOLDS: GateThresholds = {
  minWinRate: 0.9,
  maxStalemateRate: 0.05,
  maxP99Ms: 1000,
};

const MASTERMIND = 'mastermind';
const list = (seeds: number[]): string => seeds.join(', ');
const pct = (x: number): string => `${(x * 100).toFixed(0)}%`;

/**
 * Checks Mastermind-vs-Rookie records against the thresholds and returns the violations.
 * Pure: takes records only, so it is unit-testable without running matches.
 */
export function evaluateGate(
  records: readonly AiMatchRecord[],
  t: GateThresholds = DEFAULT_THRESHOLDS,
): string[] {
  const failures: string[] = [];
  if (records.length === 0) return ['no matches were played'];
  const wins = records.filter((r) => r.winnerConfig?.difficulty === MASTERMIND);
  const rate = wins.length / records.length;
  if (rate < t.minWinRate) {
    const lost = records.filter((r) => !wins.includes(r)).map((r) => r.seed);
    failures.push(
      `Mastermind win rate ${pct(rate)} < ${pct(t.minWinRate)} (seeds not won: ${list(lost)})`,
    );
  }
  const errored = records.filter((r) => r.errors.length > 0);
  if (errored.length > 0) {
    const first = errored[0]!.errors[0]!;
    failures.push(
      `CPU errors/stalls in seeds ${list(errored.map((r) => r.seed))} (first: ${first.where}: ${first.message})`,
    );
  }
  const stale = records.filter((r) => r.endReason === 'turnLimit');
  if (stale.length / records.length > t.maxStalemateRate) {
    failures.push(
      `${stale.length}/${records.length} matches hit the turn limit, allowed ${pct(t.maxStalemateRate)} (seeds: ${list(stale.map((r) => r.seed))})`,
    );
  }
  const p99 = thinkTimeStats(records.flatMap((r) => r.teams.flatMap((x) => x.planTimesMs))).p99;
  if (p99 > t.maxP99Ms) failures.push(`think-time p99 ${p99.toFixed(0)} ms > ${t.maxP99Ms} ms`);
  return failures;
}

/** Teams of the gate match for `seed`: seats alternate and personalities cycle with the seed. */
export function gateTeams(seed: number): AiTeamSpec[] {
  const n = PERSONALITIES.length;
  const m: AiTeamSpec = { difficulty: MASTERMIND, personality: PERSONALITIES[seed % n]! };
  const r: AiTeamSpec = { difficulty: 'rookie', personality: PERSONALITIES[(seed + 1) % n]! };
  return seed % 2 === 0 ? [m, r] : [r, m];
}

function smoke(o: AiGateOptions, registries: ContentRegistries, failures: string[]): string {
  const n = o.smokeMatches ?? 3;
  if (n === 0) return 'smoke (4 teams): skipped';
  const teams: AiTeamSpec[] = [
    { difficulty: 'rookie', personality: 'aggressive' },
    { difficulty: 'rookie', personality: 'cautious' },
    { difficulty: 'veteran', personality: 'opportunist' },
    { difficulty: MASTERMIND, personality: 'aggressive' },
  ];
  const records = runAiMatches({
    registries,
    matches: n,
    startSeed: o.startSeed ?? 1,
    teams,
    snailsPerTeam: 1,
    turnCap: o.turnCap ?? 60,
  });
  const bad = records.filter((r) => r.errors.length > 0).map((r) => r.seed);
  if (bad.length > 0) failures.push(`4-team smoke errors in seeds ${list(bad)}`);
  return `smoke (4 teams): ${n} matches, ${bad.length} with errors`;
}

/** Default minimum Mastermind win rate in the terrain-style sweep. */
const STYLE_MIN_WIN_RATE = 0.75;

/** Mastermind-vs-Rookie matches on the server's terrain config, `styleMatches` per style. */
function styleSweep(
  o: AiGateOptions,
  registries: ContentRegistries,
  start: number,
): AiMatchRecord[] {
  const per = o.styleMatches ?? 6;
  return (o.styles ?? TERRAIN_STYLES).flatMap((style) =>
    Array.from({ length: per }, (_, i) =>
      runAiMatch({
        registries,
        seed: start + i,
        style,
        teams: gateTeams(start + i),
        snailsPerTeam: o.snailsPerTeam ?? 2,
        turnCap: o.turnCap ?? 60,
      }),
    ),
  );
}

/**
 * Plays seeded Mastermind-vs-Rookie matches (seat order alternating, personalities cycling)
 * plus a 4-team smoke test, and checks win rate, errors, stalemates and think time.
 */
export function runAiGate(opts: AiGateOptions = {}): AiGateResult {
  const registries = opts.registries ?? loadContentPacks([basePack]).registries;
  const start = opts.startSeed ?? 1;
  const thresholds: GateThresholds = {
    minWinRate: opts.minWinRate ?? DEFAULT_THRESHOLDS.minWinRate,
    maxStalemateRate: opts.maxStalemateRate ?? DEFAULT_THRESHOLDS.maxStalemateRate,
    maxP99Ms: opts.maxP99Ms ?? DEFAULT_THRESHOLDS.maxP99Ms,
  };
  const records = Array.from({ length: opts.matches ?? 30 }, (_, i) =>
    runAiMatch({
      registries,
      seed: start + i,
      teams: gateTeams(start + i),
      snailsPerTeam: opts.snailsPerTeam ?? 2,
      turnCap: opts.turnCap ?? 60,
    }),
  );
  const sweep = styleSweep(opts, registries, start);
  const failures = evaluateGate(records, thresholds);
  failures.push(
    ...(sweep.length === 0
      ? []
      : evaluateGate(sweep, {
          ...thresholds,
          minWinRate: opts.styleMinWinRate ?? STYLE_MIN_WIN_RATE,
        }).map((f) => `style sweep: ${f}`)),
  );
  const smokeLine = smoke(opts, registries, failures);
  const verdict =
    failures.length === 0
      ? 'AI gate: PASS'
      : ['AI gate: FAIL', ...failures.map((f) => `  - ${f}`)].join('\n');
  const report = [
    formatSummary(summarize(records)),
    '',
    ...(sweep.length > 0
      ? [formatSummary(summarize(sweep)).split('\n')[0], formatStyleTable(sweep), '']
      : []),
    smokeLine,
    verdict,
  ].join('\n');
  return { passed: failures.length === 0, report, failures };
}
