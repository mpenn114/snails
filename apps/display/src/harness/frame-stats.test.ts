import { describe, expect, it } from 'vitest';
import { createFrameStats } from './frame-stats.js';

describe('createFrameStats', () => {
  it('reports steady fps and 1% low', () => {
    const s = createFrameStats();
    for (let i = 0; i < 100; i++) s.record(20);
    expect(s.fps).toBeCloseTo(50);
    expect(s.fpsLow1).toBeCloseTo(50);
  });
  it('1% low reflects the slowest frame', () => {
    const s = createFrameStats(100);
    for (let i = 0; i < 99; i++) s.record(10);
    s.record(100);
    expect(s.fpsLow1).toBeCloseTo(10);
    expect(s.lastMs).toBe(100);
  });
  it('ignores invalid samples', () => {
    const s = createFrameStats();
    s.record(0);
    s.record(Number.NaN);
    expect(s.fps).toBe(0);
    expect(s.fpsLow1).toBe(0);
  });
});
