import { loadContentPacks } from '@snails/core';
import { basePack } from '@snails/content-base';
import { describe, expect, it } from 'vitest';
import { runBalance, type BalanceOptions } from './match-runner.js';
import { focusBranch } from './research-policy.js';

const options: BalanceOptions = {
  registries: loadContentPacks([basePack]).registries,
  matches: 2,
  snailsPerTeam: 1,
  turnCap: 6,
};

describe('balance runner', () => {
  it('is deterministic per seed and records builds', () => {
    const a = runBalance(options);
    const b = runBalance(options);
    expect(a).toEqual(b);
    expect(a).toHaveLength(2);
    expect(a[0]?.turns).toBeGreaterThan(0);
    expect(a[0]?.teams).toHaveLength(2);
  }, 60_000);

  it('picks a stable focus branch per seed', () => {
    expect(focusBranch(3, 0)).toBe(focusBranch(3, 0));
  });
});
