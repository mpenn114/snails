import { describe, expect, it } from 'vitest';
import { Rng } from '@snails/core';
import { BallisticSolverStrategy, RandomAimStrategy, simulateMiss } from './index.js';

const ctx = {
  origin: { x: 0, y: 5, z: 0 },
  target: { x: 30, y: 0, z: 0 },
  wind: 0,
  maxSpeed: 30,
};

describe('CPU strategies', () => {
  it('random is deterministic per seed', () => {
    expect(new RandomAimStrategy(new Rng(1)).chooseShot()).toEqual(
      new RandomAimStrategy(new Rng(1)).chooseShot(),
    );
  });
  it('solver lands near the target', () => {
    const shot = new BallisticSolverStrategy().chooseShot(ctx);
    expect(simulateMiss(ctx, shot)).toBeLessThan(2);
  });
});
