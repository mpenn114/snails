import { describe, expect, it } from 'vitest';
import type { SimEvent } from '../sim/events.js';
import { createMatch, type MatchSetup } from '../sim/match.js';
import { testMatchOptions } from '../sim/test-match.js';
import type { MatchSettingsInput } from './match-settings.js';

function options(settings: MatchSettingsInput) {
  const base = testMatchOptions(21);
  const turn = { introDuration: 0.5, retreatDuration: 0.5 };
  return { ...base, turn, settings: { crates: 'off' as const, wind: 'off' as const, ...settings } };
}

/** Ends every turn at once until `until` is true; returns every event seen. */
function playUntil(setup: MatchSetup, until: () => boolean, maxSteps = 200_000): SimEvent[] {
  const events: SimEvent[] = [];
  const { sim } = setup;
  for (let i = 0; i < maxSteps && !until() && sim.state.match.status === 'playing'; i++) {
    if (sim.state.turn.phase === 'action' && sim.state.turn.activeTeamId) {
      sim.enqueue({ type: 'endTurn', teamId: sim.state.turn.activeTeamId });
    }
    events.push(...sim.step());
  }
  return events;
}

describe('sudden death: rising water', () => {
  it('does nothing before the start round and is off when null', () => {
    const early = createMatch(options({ suddenDeathRound: 3, suddenDeathType: 'water' }));
    const level = early.sim.state.terrain.waterLevel;
    playUntil(early, () => early.sim.state.turn.turnNumber > 3);
    expect(early.sim.state.terrain.waterLevel).toBe(level);
    expect(early.sim.state.suddenDeath).toBeUndefined();

    const off = createMatch(options({ suddenDeathRound: null }));
    playUntil(off, () => off.sim.state.turn.turnNumber > 10);
    expect(off.sim.state.terrain.waterLevel).toBe(level);
  });

  it('announces itself once and raises the water each turn start by the per-round share', () => {
    const setup = createMatch(
      options({ suddenDeathRound: 2, suddenDeathType: 'water', suddenDeathWaterRise: 2 }),
    );
    const level = setup.sim.state.terrain.waterLevel;
    const events = playUntil(setup, () => setup.sim.state.turn.turnNumber > 5);
    const started = events.filter((e) => e.type === 'suddenDeathStarted');
    expect(started).toEqual([{ type: 'suddenDeathStarted', round: 2, kind: 'water' }]);
    // Turns 3 to 6 are rounds 2 and 3 of a two-team match: four turn starts of 1 m each.
    expect(events.filter((e) => e.type === 'waterRose')).toHaveLength(4);
    expect(setup.sim.state.terrain.waterLevel).toBeCloseTo(level + 4);
    expect(setup.sim.state.suddenDeath).toEqual({ startRound: 2, drainStep: 0 });
  });

  it('drowns snails as it climbs and always ends the match', () => {
    const setup = createMatch(
      options({ suddenDeathRound: 1, suddenDeathType: 'water', suddenDeathWaterRise: 5 }),
    );
    const events = playUntil(setup, () => false);
    expect(events.some((e) => e.type === 'snailDrowned')).toBe(true);
    expect(setup.sim.state.match.status).not.toBe('playing');
    expect(events.some((e) => e.type === 'matchEnded')).toBe(true);
    const levels = events.flatMap((e) => (e.type === 'waterRose' ? [e.level] : []));
    expect(levels).toEqual([...levels].sort((a, b) => a - b));
  });

  it('is deterministic for a seed', () => {
    const run = (): string => {
      const s = createMatch(options({ suddenDeathRound: 1, suddenDeathWaterRise: 3 }));
      playUntil(s, () => false);
      return JSON.stringify(s.sim.state);
    };
    expect(run()).toBe(run());
  });
});

describe('sudden death: health drain', () => {
  it('steps maximum health down each round to 1 without touching the water', () => {
    const setup = createMatch(
      options({ suddenDeathRound: 1, suddenDeathType: 'drain', suddenDeathDrainRounds: 5 }),
    );
    const level = setup.sim.state.terrain.waterLevel;
    const all = setup.sim.state.teams.flatMap((t) => t.snails);
    const events = playUntil(setup, () => setup.sim.state.turn.turnNumber > 10);
    expect(setup.sim.state.suddenDeath).toEqual({ startRound: 1, drainStep: 20 });
    expect(all.map((s) => [s.maxHealth, s.health])).toEqual(all.map(() => [1, 1]));
    expect(setup.sim.state.terrain.waterLevel).toBe(level);
    const hits = events.filter((e) => e.type === 'snailDamaged' && e.cause === 'suddenDeath');
    expect(hits.length).toBeGreaterThan(0);
  });

  it('first drain round takes max health to 80 and clamps health', () => {
    const setup = createMatch(options({ suddenDeathRound: 1, suddenDeathType: 'drain' }));
    setup.sim.step();
    for (const s of setup.sim.state.teams.flatMap((t) => t.snails)) {
      expect(s.maxHealth).toBe(80);
      expect(s.health).toBe(80);
    }
  });

  it('both mode drains and floods', () => {
    const setup = createMatch(options({ suddenDeathRound: 1, suddenDeathType: 'both' }));
    const level = setup.sim.state.terrain.waterLevel;
    setup.sim.step();
    expect(setup.sim.state.terrain.waterLevel).toBeGreaterThan(level);
    expect(setup.sim.state.teams[0]?.snails[0]?.maxHealth).toBe(80);
  });
});
