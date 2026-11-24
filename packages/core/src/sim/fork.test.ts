import { describe, expect, it } from 'vitest';
import { createMatch, type MatchSetup } from './match.js';
import { forkMatch } from './fork.js';
import { testMatchOptions, PEBBLE } from './test-match.js';
import { createScriptedBot } from './scripted-bot.js';

const WARMUP = 60;
const TICKS = 1200;

const bots = ['a', 'b'].map((id) => createScriptedBot(id, PEBBLE));

/** Steps `ticks` ticks with scripted bots aiming and firing; returns whether terrain was hit. */
function run(setup: MatchSetup, ticks: number): boolean {
  let exploded = false;
  for (let i = 0; i < ticks; i++) {
    for (const bot of bots) bot(setup.sim);
    if (setup.sim.step().some((e) => e.type === 'explosion')) exploded = true;
  }
  return exploded;
}

function warmed(seed = 7): MatchSetup {
  const m = createMatch(testMatchOptions(seed));
  for (let i = 0; i < WARMUP; i++) m.sim.step();
  return m;
}

describe('forkMatch', () => {
  it('steps identically to the original with the same commands', () => {
    const a = warmed();
    const b = forkMatch(a);
    expect(run(a, TICKS)).toBe(true);
    run(b, TICKS);
    expect(b.sim.snapshot()).toEqual(a.sim.snapshot());
    expect(b.sim.terrain.data).toEqual(a.sim.terrain.data);
    expect(b.sim.rng.saveState()).toEqual(a.sim.rng.saveState());
  });

  it('leaves the original untouched, including terrain', () => {
    const a = warmed();
    const before = a.sim.snapshot();
    const terrain = a.sim.terrain.data.slice();
    const b = forkMatch(a);
    expect(run(b, TICKS)).toBe(true);
    b.sim.state.tick = 9999;
    expect(b.sim.terrain.data).not.toEqual(terrain);
    expect(a.sim.snapshot()).toEqual(before);
    expect(a.sim.terrain.data).toEqual(terrain);
  });

  it('supports forking a fork', () => {
    const a = warmed();
    const c = forkMatch(forkMatch(a));
    run(a, TICKS);
    run(c, TICKS);
    expect(c.sim.snapshot()).toEqual(a.sim.snapshot());
  });

  it('forks a default-size match quickly', () => {
    const m = createMatch({ ...testMatchOptions(3), terrain: undefined });
    forkMatch(m);
    const runs = 10;
    const t0 = performance.now();
    for (let i = 0; i < runs; i++) forkMatch(m);
    const mean = (performance.now() - t0) / runs;
    console.info(`fork mean ${mean.toFixed(2)} ms`);
    expect(mean).toBeLessThan(50);
  });
});
