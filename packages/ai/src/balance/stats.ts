import type { Branch } from './research-policy.js';

/** One team's result in a headless match. */
export interface TeamRecord {
  teamId: string;
  focus: Branch;
  /** Completed tech ids at the end of the match. */
  researched: string[];
  /** Branch of each completed tech, aligned with `researched`. */
  branches: Branch[];
  /** Capstone the team completed, if any. */
  capstone: string | null;
}

/** Result of one headless match. */
export interface MatchRecord {
  seed: number;
  turns: number;
  winnerTeamId: string | null;
  /** Team that took the first turn. */
  firstTeamId: string;
  endReason: 'elimination' | 'research' | 'turnLimit' | 'draw';
  teams: TeamRecord[];
}

/** Timing used to turn turns into estimated minutes. */
export interface BalanceTiming {
  turnSeconds: number;
  retreatSeconds: number;
  /** Average seconds a shot takes to resolve. */
  resolveSeconds: number;
}

/** Per-tech statistics. */
export interface TechStats {
  id: string;
  branch: Branch;
  /** Share of all team builds that own the tech. */
  pickRate: number;
  /** Share of winning builds that own the tech. */
  winningBuildRate: number;
  /** Wins divided by builds owning the tech (0 when never owned). */
  winRateWhenOwned: number;
  owned: number;
}

/** Per-branch statistics; a build's branch is the one it owns the most techs in. */
export interface BranchStats {
  branch: Branch;
  builds: number;
  wins: number;
  winRate: number;
  /** Share of all wins that came from this branch. */
  shareOfWins: number;
}

/** Aggregated balance report. */
export interface BalanceReport {
  matches: number;
  decided: number;
  draws: number;
  winsByTeam: Record<string, number>;
  firstMoverWins: number;
  firstMoverWinRate: number;
  avgTurns: number;
  estMinutes: number;
  techs: TechStats[];
  branches: BranchStats[];
  capstones: Record<string, number>;
  researchRaceWins: number;
  flags: string[];
}

/** Doc targets (technology-research.md "Testing the balance"). */
export const TARGETS = { maxTechShare: 0.7, minBranchShare: 0.15, maxFirstMover: 0.55 } as const;

function ratio(n: number, d: number): number {
  return d === 0 ? 0 : n / d;
}

const pct = (x: number): string => `${(x * 100).toFixed(0)}%`;

/** The branch a build owns the most techs in (ties go to its focus, then branch order). */
export function dominantBranch(t: TeamRecord): Branch {
  const counts = new Map<Branch, number>();
  for (const b of t.branches) counts.set(b, (counts.get(b) ?? 0) + 1);
  let best = t.focus;
  let bestN = counts.get(t.focus) ?? 0;
  for (const [b, n] of [...counts].sort(([a], [c]) => (a < c ? -1 : 1))) {
    if (n > bestN) {
      best = b;
      bestN = n;
    }
  }
  return best;
}

interface Build {
  t: TeamRecord;
  won: boolean;
}

function techStats(builds: Build[], winners: number): TechStats[] {
  const info = new Map<string, Branch>();
  for (const { t } of builds)
    t.researched.forEach((id, i) => info.set(id, t.branches[i] as Branch));
  return [...info]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([id, branch]) => {
      const owners = builds.filter((b) => b.t.researched.includes(id));
      const wins = owners.filter((b) => b.won).length;
      return {
        id,
        branch,
        owned: owners.length,
        pickRate: ratio(owners.length, builds.length),
        winningBuildRate: ratio(wins, winners),
        winRateWhenOwned: ratio(wins, owners.length),
      };
    });
}

function branchStats(builds: Build[], winners: number): BranchStats[] {
  return BRANCH_LIST.map((branch) => {
    const mine = builds.filter((b) => dominantBranch(b.t) === branch);
    const wins = mine.filter((b) => b.won).length;
    return {
      branch,
      builds: mine.length,
      wins,
      winRate: ratio(wins, mine.length),
      shareOfWins: ratio(wins, winners),
    };
  });
}

const BRANCH_LIST: readonly Branch[] = ['weaponry', 'shell', 'mobility', 'utility'];

/** Aggregates match records into a {@link BalanceReport} and flags target violations. */
export function aggregate(records: readonly MatchRecord[], timing: BalanceTiming): BalanceReport {
  const builds: Build[] = records.flatMap((r) =>
    r.teams.map((t) => ({ t, won: r.winnerTeamId === t.teamId })),
  );
  const decided = records.filter((r) => r.winnerTeamId !== null);
  const winners = builds.filter((b) => b.won).length;
  const capstones: Record<string, number> = {};
  for (const { t } of builds)
    if (t.capstone) capstones[t.capstone] = (capstones[t.capstone] ?? 0) + 1;
  const winsByTeam: Record<string, number> = {};
  for (const r of decided) {
    const id = r.winnerTeamId as string;
    winsByTeam[id] = (winsByTeam[id] ?? 0) + 1;
  }
  const firstMoverWins = decided.filter((r) => r.winnerTeamId === r.firstTeamId).length;
  const avgTurns = ratio(
    records.reduce((n, r) => n + r.turns, 0),
    records.length,
  );
  const perTurn = timing.turnSeconds + timing.retreatSeconds + timing.resolveSeconds;
  const report: BalanceReport = {
    matches: records.length,
    decided: decided.length,
    draws: records.length - decided.length,
    winsByTeam,
    firstMoverWins,
    firstMoverWinRate: ratio(firstMoverWins, decided.length),
    avgTurns,
    estMinutes: (avgTurns * perTurn) / 60,
    techs: techStats(builds, winners),
    branches: branchStats(builds, winners),
    capstones,
    researchRaceWins: records.filter((r) => r.endReason === 'research').length,
    flags: [],
  };
  report.flags = flagsOf(report);
  return report;
}

/** Lists target violations; empty when the numbers are inside the doc's targets. */
export function flagsOf(report: BalanceReport): string[] {
  if (report.decided === 0) return [];
  const out: string[] = [];
  if (report.firstMoverWinRate >= TARGETS.maxFirstMover) {
    out.push(`first-turn advantage ${pct(report.firstMoverWinRate)} (target < 55%)`);
  }
  for (const t of report.techs) {
    if (t.winningBuildRate > TARGETS.maxTechShare) {
      out.push(`${t.id} in ${pct(t.winningBuildRate)} of winning builds (target <= 70%)`);
    }
  }
  for (const b of report.branches) {
    if (b.shareOfWins < TARGETS.minBranchShare) {
      out.push(`${b.branch} branch ${pct(b.shareOfWins)} of wins (target >= 15%)`);
    }
  }
  return out;
}

function counts(rec: Record<string, number>): string {
  const s = Object.entries(rec).map(([k, v]) => `${k}=${v}`);
  return s.length ? s.join(', ') : 'none';
}

/** Renders a short markdown dashboard. */
export function formatDashboard(r: BalanceReport): string {
  return [
    '# Balance dashboard',
    '',
    `- Matches: ${r.matches} (${r.decided} decided, ${r.draws} draws)`,
    `- Wins by team: ${counts(r.winsByTeam)}`,
    `- First mover wins: ${r.firstMoverWins}/${r.decided} (${pct(r.firstMoverWinRate)})`,
    `- Average length: ${r.avgTurns.toFixed(1)} turns, about ${r.estMinutes.toFixed(1)} min`,
    `- Research race wins: ${r.researchRaceWins}`,
    `- Capstones completed: ${counts(r.capstones)}`,
    '',
    '## Branches',
    '| branch | builds | wins | win rate | share of wins |',
    '| --- | ---: | ---: | ---: | ---: |',
    ...r.branches.map(
      (b) =>
        `| ${b.branch} | ${b.builds} | ${b.wins} | ${pct(b.winRate)} | ${pct(b.shareOfWins)} |`,
    ),
    '',
    '## Techs',
    '| tech | branch | pick rate | in winning builds | win rate when owned |',
    '| --- | --- | ---: | ---: | ---: |',
    ...r.techs.map(
      (t) =>
        `| ${t.id} | ${t.branch} | ${pct(t.pickRate)} | ${pct(t.winningBuildRate)} | ${pct(t.winRateWhenOwned)} |`,
    ),
    '',
    '## Target flags',
    ...(r.flags.length ? r.flags.map((f) => `- ${f}`) : ['- none']),
  ].join('\n');
}
