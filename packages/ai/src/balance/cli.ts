import { writeFileSync } from 'node:fs';
import { loadContentPacks } from '@snails/core';
import { basePack } from '@snails/content-base';
import { runBalance, timingOf, type BalanceOptions } from './match-runner.js';
import { aggregate, formatDashboard } from './stats.js';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/**
 * Headless balance runner: `pnpm sim:balance [--matches 40] [--mode researchRace]
 * [--snails 2] [--turns 60] [--out file.json]`. Dashboard goes to stderr, JSON to stdout or
 * `--out`.
 */
const options: BalanceOptions = {
  registries: loadContentPacks([basePack]).registries,
  matches: Number(arg('matches') ?? 40),
  mode: arg('mode') === 'researchRace' ? 'researchRace' : 'elimination',
  snailsPerTeam: Number(arg('snails') ?? 2),
  turnCap: Number(arg('turns') ?? 60),
};
const report = aggregate(runBalance(options), timingOf(options));
const out = arg('out');
if (out) writeFileSync(out, JSON.stringify(report, null, 2));
else console.log(JSON.stringify(report));
console.error(formatDashboard(report));
