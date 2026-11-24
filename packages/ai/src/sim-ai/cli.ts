import { loadContentPacks } from '@snails/core';
import { basePack } from '@snails/content-base';
import { parseTeamSpec } from './parse-team.js';
import { formatSummary, runAiMatches, summarize, withoutTimings } from './summary.js';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/**
 * Headless AI runner: `pnpm sim:ai [--matches 10] [--seed 1] [--a rookie:aggressive]
 * [--b mastermind:cautious] [--c ..] [--d ..] [--snails 2] [--turns 60] [--json]`.
 * `--seed` is the first seed; seeds count up from it.
 */
function main(): void {
  const teams = ['a', 'b', 'c', 'd']
    .map((k) => arg(k))
    .filter((v): v is string => v !== undefined)
    .map(parseTeamSpec);
  if (teams.length === 0)
    teams.push(parseTeamSpec('rookie:aggressive'), parseTeamSpec('mastermind:cautious'));
  const records = runAiMatches({
    registries: loadContentPacks([basePack]).registries,
    matches: Number(arg('matches') ?? 10),
    startSeed: Number(arg('seed') ?? 1),
    teams,
    snailsPerTeam: Number(arg('snails') ?? 2),
    turnCap: Number(arg('turns') ?? 60),
  });
  const summary = summarize(records);
  if (process.argv.includes('--json')) {
    const slim = records.map(withoutTimings);
    console.log(JSON.stringify({ summary, records: slim }));
  } else {
    console.log(formatSummary(summary));
  }
  if (summary.errors > 0) {
    console.error(
      `errors in seeds: ${summary.failedSeeds.join(', ')} (rerun with --seed N --matches 1)`,
    );
    process.exitCode = 1;
  }
}

main();
