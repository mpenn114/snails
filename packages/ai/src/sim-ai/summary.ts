import { runAiMatch } from './run-match.js';
import { thinkTimeStats, type ThinkTimeStats } from './think-time.js';
import type { AiMatchOptions, AiMatchRecord } from './types.js';

/** The record without the non-deterministic wall-clock timings (for JSON output and comparisons). */
export function withoutTimings(r: AiMatchRecord): Omit<AiMatchRecord, 'teams'> & {
  teams: Omit<AiMatchRecord['teams'][number], 'planTimesMs'>[];
} {
  return {
    ...r,
    teams: r.teams.map((t) => {
      const { planTimesMs: omitted, ...rest } = t;
      void omitted;
      return rest;
    }),
  };
}

/** Options of a batch: seeds `startSeed .. startSeed + matches - 1` are played. */
export type AiBatchOptions = Omit<AiMatchOptions, 'seed'> & { matches: number; startSeed: number };

/** Games, wins and win rate of one `difficulty:personality` config. */
export interface ConfigStats {
  config: string;
  games: number;
  wins: number;
  winRate: number;
}

/** Aggregate of a batch of AI matches. */
export interface AiSummary {
  matches: number;
  avgTurns: number;
  /** Matches that hit the turn limit. */
  stalemates: number;
  draws: number;
  errors: number;
  /** Seeds of matches that recorded errors, for reproduction. */
  failedSeeds: number[];
  configs: ConfigStats[];
  thinkTime: Record<string, ThinkTimeStats>;
}

/** Plays every seed of the batch and returns the records. */
export function runAiMatches(o: AiBatchOptions): AiMatchRecord[] {
  const { matches, startSeed, ...rest } = o;
  return Array.from({ length: matches }, (_, i) => runAiMatch({ ...rest, seed: startSeed + i }));
}

/** Aggregates records: win rate per config, turns, stalemates, errors, think time by difficulty. */
export function summarize(records: readonly AiMatchRecord[]): AiSummary {
  const configs = new Map<string, ConfigStats>();
  const times = new Map<string, number[]>();
  for (const r of records) {
    for (const t of r.teams) {
      const key = `${t.difficulty}:${t.personality}`;
      const c = configs.get(key) ?? { config: key, games: 0, wins: 0, winRate: 0 };
      c.games += 1;
      if (r.winner === t.index) c.wins += 1;
      c.winRate = c.wins / c.games;
      configs.set(key, c);
      times.set(t.difficulty, [...(times.get(t.difficulty) ?? []), ...t.planTimesMs]);
    }
  }
  const failed = records.filter((r) => r.errors.length > 0);
  return {
    matches: records.length,
    avgTurns: records.length ? records.reduce((n, r) => n + r.turns, 0) / records.length : 0,
    stalemates: records.filter((r) => r.endReason === 'turnLimit').length,
    draws: records.filter((r) => r.endReason === 'draw').length,
    errors: records.reduce((n, r) => n + r.errors.length, 0),
    failedSeeds: failed.map((r) => r.seed),
    configs: [...configs.values()],
    thinkTime: Object.fromEntries([...times].map(([k, v]) => [k, thinkTimeStats(v)])),
  };
}

const ms = (x: number): string => x.toFixed(1);

/** Renders a summary as a readable text table. */
export function formatSummary(s: AiSummary): string {
  return [
    `matches ${s.matches}, avg turns ${s.avgTurns.toFixed(1)}, stalemates ${s.stalemates}, draws ${s.draws}, errors ${s.errors}`,
    ...(s.failedSeeds.length ? [`reproduce with --seed: ${s.failedSeeds.join(', ')}`] : []),
    '',
    'config               games  wins  win rate',
    ...s.configs.map(
      (c) =>
        `${c.config.padEnd(20)} ${String(c.games).padStart(5)} ${String(c.wins).padStart(5)}  ${(c.winRate * 100).toFixed(0)}%`,
    ),
    '',
    'think time (ms)      plans   p50    p95    p99    max',
    ...Object.entries(s.thinkTime).map(
      ([k, t]) =>
        `${k.padEnd(20)} ${String(t.count).padStart(5)} ${ms(t.p50).padStart(6)} ${ms(t.p95).padStart(6)} ${ms(t.p99).padStart(6)} ${ms(t.max).padStart(6)}`,
    ),
  ].join('\n');
}

/** Per-style table: completion, turns, draws, turn limits, drownings, idle turns, errors. */
export function formatStyleTable(records: readonly AiMatchRecord[]): string {
  const styles = [...new Set(records.map((r) => r.style ?? 'legacy'))];
  const rows = styles.map((style) => {
    const rs = records.filter((r) => (r.style ?? 'legacy') === style);
    const n = rs.length;
    const sum = (f: (r: AiMatchRecord) => number): number => rs.reduce((a, r) => a + f(r), 0);
    const done = rs.filter((r) => r.endReason === 'elimination' || r.endReason === 'research');
    const turns = sum((r) => r.turns);
    const idle = sum((r) => r.idleTurns);
    return [
      style.padEnd(12),
      `matches ${n}`,
      `completed ${((done.length / n) * 100).toFixed(0)}%`,
      `avg turns ${(turns / n).toFixed(1)}`,
      `draws ${rs.filter((r) => r.endReason === 'draw').length}`,
      `turn-limit ${rs.filter((r) => r.endReason === 'turnLimit').length}`,
      `drownings ${sum((r) => r.drownings)} (unprovoked ${sum((r) => r.unprovokedDrownings)})`,
      `idle turns ${((idle / Math.max(1, turns)) * 100).toFixed(0)}%`,
      `errors ${sum((r) => r.errors.length)}`,
    ].join('  ');
  });
  return ['By terrain style:', ...rows].join('\n');
}
