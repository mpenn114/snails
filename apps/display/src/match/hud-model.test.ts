import { describe, expect, it } from 'vitest';
import { createInitialState } from '@snails/core';
import { hudFromSnapshot } from './hud-model';

function state() {
  return createInitialState({
    seed: 1,
    teams: [
      { id: 'a', name: 'Red', colour: '#f00', snails: [{ id: 'a1', name: 'Al' }] },
      { id: 'b', name: 'Blue', colour: '#00f', snails: [{ id: 'b1', name: 'Bo' }] },
    ],
    terrain: { nx: 4, ny: 4, nz: 4 },
  });
}

describe('hudFromSnapshot hill scores', () => {
  it('carries per-team hill scores and the target', () => {
    const s = state();
    s.hill = { position: { x: 1, y: 1, z: 1 }, radius: 3, scores: { a: 7 }, target: 30 };
    const bars = hudFromSnapshot(s, null, null).bars;
    expect(bars[0]).toMatchObject({ score: 7, target: 30 });
    expect(bars[1]).toMatchObject({ score: 0, target: 30 });
  });

  it('has no scores outside King of the Hill', () => {
    expect(hudFromSnapshot(state(), null, null).bars[0]).toMatchObject({
      score: null,
      target: null,
    });
  });
});
