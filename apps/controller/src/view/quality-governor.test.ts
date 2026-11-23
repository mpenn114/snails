import { describe, expect, it } from 'vitest';
import { LOWEST_LEVEL, QUALITY_LADDER, QualityGovernor, percentile } from './quality-governor';
import type { LevelChange } from './quality-governor';

/** Feeds constant-dt frames for `ms` of simulated time; returns changes and the end time. */
function run(g: QualityGovernor, start: number, ms: number, dt: number): [LevelChange[], number] {
  const changes: LevelChange[] = [];
  let t = start;
  const end = start + ms;
  while (t < end) {
    t += dt;
    const c = g.pushFrame(dt, t);
    if (c) changes.push(c);
  }
  return [changes, t];
}

/** Feeds constant-dt frames until the level changes (or `maxMs` pass); returns the end time. */
function runUntilChange(g: QualityGovernor, start: number, dt: number, maxMs = 60000): number {
  let t = start;
  while (t < start + maxMs) {
    t += dt;
    if (g.pushFrame(dt, t)) break;
  }
  return t;
}

describe('percentile', () => {
  it('uses nearest rank', () => {
    expect(percentile([], 0.9)).toBe(0);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.9)).toBe(9);
  });
});

describe('QualityGovernor', () => {
  it('stays put at 60 fps', () => {
    const g = new QualityGovernor();
    const [changes] = run(g, 0, 30000, 16.7);
    expect(changes).toEqual([]);
    expect(g.level).toBe(0);
  });

  it('steps down after a full window of slow frames, one rung per window', () => {
    const g = new QualityGovernor();
    const [changes] = run(g, 0, 4500, 40);
    expect(changes.map((c) => c.level)).toEqual([1, 2]);
    expect(changes[0]?.settings.pixelRatioScale).toBe(0.85);
  });

  it('is not triggered by a few slow frames (p90)', () => {
    const g = new QualityGovernor();
    let t = 0;
    for (let i = 0; i < 300; i++) {
      const dt = i % 20 === 0 ? 80 : 16.7;
      t += dt;
      expect(g.pushFrame(dt, t)).toBeNull();
    }
  });

  it('bottoms out at the 30 fps cap rung and stays there', () => {
    const g = new QualityGovernor();
    run(g, 0, 60000, 50);
    expect(g.level).toBe(LOWEST_LEVEL);
    expect(g.fpsCap).toBe(30);
  });

  it('steps up only after sustained headroom', () => {
    const g = new QualityGovernor();
    const [, t1] = run(g, 0, 2100, 40);
    expect(g.level).toBe(1);
    const [early, t2] = run(g, t1, 10000, 16.7);
    expect(early).toEqual([]);
    const [late] = run(g, t2, 8000, 16.7);
    expect(late.map((c) => c.level)).toEqual([0]);
  });

  it('backs off exponentially when a step up is quickly undone', () => {
    const g = new QualityGovernor({ upAfterMs: 4000 });
    let t = runUntilChange(g, 0, 40);
    expect(g.level).toBe(1);
    t = runUntilChange(g, t, 16.7);
    expect(g.level).toBe(0);
    const upAt = t;
    t = runUntilChange(g, t, 40);
    expect(g.level).toBe(1);
    t = runUntilChange(g, t, 16.7);
    expect(g.level).toBe(0);
    // First wait: window refill (2 s) + 4 s; after the flap the headroom wait doubled to 8 s.
    expect(t - upAt).toBeGreaterThan(2000 + 8000);
  });

  it('judges the 30 fps rung against a 33 ms budget', () => {
    const g = new QualityGovernor();
    const [, t] = run(g, 0, 60000, 50);
    const [changes] = run(g, t, 10000, 33.4);
    expect(changes).toEqual([]);
    expect(g.level).toBe(LOWEST_LEVEL);
  });

  it('battery saver pins the lowest rung with a 30 fps cap and ignores frames', () => {
    const g = new QualityGovernor();
    const c = g.setBatterySaver(true, 0);
    expect(c?.settings).toEqual(QUALITY_LADDER[LOWEST_LEVEL]);
    expect(g.fpsCap).toBe(30);
    const [changes] = run(g, 0, 10000, 100);
    expect(changes).toEqual([]);
    expect(g.setBatterySaver(true, 1)).toBeNull();
    const off = g.setBatterySaver(false, 20000);
    expect(off?.level).toBe(0);
    expect(g.fpsCap).toBe(0);
  });
});
