import { describe, expect, it } from 'vitest';
import type { WindDefinition } from '../content/types.js';
import { damageAround } from '../physics/explosion.js';
import { createMatch } from '../sim/match.js';
import { PEBBLE, testMatchOptions } from '../sim/test-match.js';
import { TERRAIN_STYLES } from '../terrain/styles/types.js';
import { computeFallDamage } from './hazards.js';
import {
  DEFAULT_MATCH_SETTINGS,
  crateRulesFromSettings,
  hazardConfigFromSettings,
  parseMatchSettings,
  resolveMapStyle,
  windConfigFromSettings,
} from './match-settings.js';

const WINDS: WindDefinition[] = [
  { id: 'base:off', name: 'Off', minStrength: 0, maxStrength: 0, changesMidFlight: false },
  { id: 'base:low', name: 'Low', minStrength: 0, maxStrength: 3, changesMidFlight: false },
  { id: 'base:storm', name: 'Storm', minStrength: 5, maxStrength: 10, changesMidFlight: true },
];

function ctxOf(sim: ReturnType<typeof createMatch>['sim']) {
  return { state: sim.state, terrain: sim.terrain, rng: sim.rng, dt: 1 / 60, emit: () => {} };
}

describe('map style setting', () => {
  it('defaults to random and rejects unknown styles', () => {
    expect(DEFAULT_MATCH_SETTINGS.mapStyle).toBe('random');
    expect(parseMatchSettings({ mapStyle: 'canyon' }).mapStyle).toBe('canyon');
    expect(() => parseMatchSettings({ mapStyle: 'moon' as never })).toThrow();
  });

  it('passes a concrete style through and resolves random deterministically', () => {
    expect(resolveMapStyle('highlands', 5)).toBe('highlands');
    expect(resolveMapStyle('random', 1234)).toBe(resolveMapStyle('random', 1234));
  });

  it('random covers every style roughly uniformly', () => {
    const counts = new Map<string, number>();
    for (let seed = 0; seed < 2000; seed++) {
      const s = resolveMapStyle('random', seed);
      counts.set(s, (counts.get(s) ?? 0) + 1);
    }
    for (const style of TERRAIN_STYLES) expect(counts.get(style) ?? 0).toBeGreaterThan(300);
  });
});

describe('MatchSettings model', () => {
  it('defaults to the Classic ruleset', () => {
    expect(DEFAULT_MATCH_SETTINGS).toMatchObject({
      turnTimeSeconds: 30,
      startingHealth: 100,
      snailsPerTeam: 3,
      wind: 'normal',
      crates: 'normal',
      crateMax: 2,
      suddenDeathRound: 20,
      fallDamage: 'on',
      friendlyFire: true,
      lazyStart: false,
      startingLoadout: {},
    });
  });

  it('accepts overrides and null to disable sudden death', () => {
    const s = parseMatchSettings({ suddenDeathRound: null, wind: 'storm', startingHealth: 150 });
    expect(s.suddenDeathRound).toBeNull();
    expect(s.wind).toBe('storm');
    expect(s.startingHealth).toBe(150);
  });

  it.each([
    { turnTimeSeconds: 0 },
    { startingHealth: 0 },
    { snailsPerTeam: 9 },
    { wind: 'gale' },
    { crateMax: -1 },
    { suddenDeathRound: 0 },
    { suddenDeathType: 'lava' },
    { friendlyFire: 'yes' },
    { startingLoadout: { 'base:x': -1 } },
  ])('rejects invalid settings %j', (bad) => {
    expect(() => parseMatchSettings(bad as never)).toThrow();
  });

  it('maps crate frequency to drop rules, off to none', () => {
    expect(crateRulesFromSettings(parseMatchSettings({ crates: 'frequent', crateMax: 4 }))).toEqual(
      { intervalRounds: 2, maxOnMap: 4 },
    );
    expect(crateRulesFromSettings(parseMatchSettings({ crates: 'off' }))).toBeNull();
    expect(crateRulesFromSettings(parseMatchSettings({ crateMax: 0 }))).toBeNull();
  });

  it('maps fall damage presets', () => {
    const fall = (p: 'off' | 'on' | 'high'): number =>
      computeFallDamage(8, hazardConfigFromSettings(parseMatchSettings({ fallDamage: p })));
    expect(fall('off')).toBe(0);
    expect(fall('on')).toBe(20);
    expect(fall('high')).toBe(40);
  });

  it('resolves the wind preset from content definitions', () => {
    const storm = windConfigFromSettings(parseMatchSettings({ wind: 'storm' }), WINDS);
    expect(storm).toMatchObject({ minStrength: 5, maxStrength: 10, changesMidFlight: true });
    expect(windConfigFromSettings(parseMatchSettings({ wind: 'off' }), WINDS)?.mode).toBe('off');
    expect(windConfigFromSettings(parseMatchSettings({ wind: 'normal' }), WINDS)).toBeUndefined();
  });
});

describe('settings honoured by a headless match', () => {
  const base = { ...testMatchOptions(11), turn: undefined };

  it('applies health, snails per team, turn and retreat time', () => {
    const { sim, turnConfig } = createMatch({
      ...base,
      teams: base.teams.map((t) => ({ id: t.id, name: t.name, colour: t.colour })),
      settings: {
        startingHealth: 60,
        snailsPerTeam: 2,
        turnTimeSeconds: 12,
        retreatTimeSeconds: 1,
      },
    });
    expect(sim.state.teams.map((t) => t.snails.length)).toEqual([2, 2]);
    expect(sim.state.teams[0]?.snails[0]).toMatchObject({ health: 60, maxHealth: 60, name: 'A 1' });
    expect(turnConfig).toMatchObject({ actionDuration: 12, retreatDuration: 1 });
    expect(sim.state.turn.timeRemaining).toBe(12);
  });

  it('rolls wind within the preset range and Off is calm', () => {
    const calm = createMatch({ ...base, winds: WINDS, settings: { wind: 'off' } });
    expect(calm.sim.state.wind.strength).toBe(0);
    for (let seed = 1; seed <= 6; seed++) {
      const low = createMatch({ ...base, seed, winds: WINDS, settings: { wind: 'low' } });
      expect(low.sim.state.wind.strength).toBeLessThanOrEqual(3);
      const storm = createMatch({ ...base, seed, winds: WINDS, settings: { wind: 'storm' } });
      expect(storm.sim.state.wind.strength).toBeGreaterThanOrEqual(5);
    }
  });

  it('storm wind changes while shells are in flight', () => {
    const { sim } = createMatch({ ...base, winds: WINDS, settings: { wind: 'storm' } });
    sim.step();
    sim.state.projectiles.push({
      id: 'p1',
      position: { x: 5, y: 20, z: 5 },
      velocity: { x: 0, y: 0, z: 0 },
      ownerSnailId: 'a:0',
      weaponId: PEBBLE.id,
      radius: 0.1,
      age: 0,
      maxAge: 30,
      gravityScale: 0,
      windScale: 0,
    });
    const winds: number[] = [];
    for (let i = 0; i < 400; i++) {
      for (const e of sim.step()) if (e.type === 'windChanged') winds.push(e.strength);
    }
    expect(winds.length).toBeGreaterThan(2);
    for (const w of winds) expect(w).toBeGreaterThanOrEqual(5);
  });

  it('lazy start holds the timer until the first input', () => {
    const { sim } = createMatch({ ...base, settings: { lazyStart: true, turnTimeSeconds: 20 } });
    for (let i = 0; i < 600 && sim.state.turn.phase !== 'action'; i++) sim.step();
    for (let i = 0; i < 120; i++) sim.step();
    expect(sim.state.turn.timeRemaining).toBe(20);
    sim.enqueue({ type: 'aim', snailId: 'a:0', angle: 0.4, power: 0.5 });
    for (let i = 0; i < 120; i++) sim.step();
    expect(sim.state.turn.timeRemaining).toBeLessThan(19);
  });

  it('turns friendly fire off for teammates but not the firer or enemies', () => {
    const { sim } = createMatch({ ...base, settings: { friendlyFire: false } });
    const [a0, a1] = sim.state.teams[0]!.snails;
    const enemy = sim.state.teams[1]!.snails[0]!;
    for (const s of [a1!, enemy]) s.position = { ...a0!.position };
    const spec = { radius: 3, maxDamage: 30, knockback: 0, falloff: 'flat' as const };
    damageAround(ctxOf(sim), a0!.position, spec, { weaponId: 'w', ownerSnailId: a0!.id });
    expect(a1!.health).toBe(100);
    expect(a0!.health).toBe(70);
    expect(enemy.health).toBe(70);
  });

  it('keeps friendly fire on by default', () => {
    const { sim } = createMatch(base);
    const [a0, a1] = sim.state.teams[0]!.snails;
    a1!.position = { ...a0!.position };
    const spec = { radius: 3, maxDamage: 30, knockback: 0, falloff: 'flat' as const };
    damageAround(ctxOf(sim), a0!.position, spec, { weaponId: 'w', ownerSnailId: a0!.id });
    expect(a1!.health).toBe(70);
  });

  it('applies the starting loadout to every team (unknown weapons are ignored)', () => {
    const loadout = { 'test:pebble-toss': 2, 'base:x': 5 };
    const { sim } = createMatch({ ...base, settings: { startingLoadout: loadout } });
    const want = { 'test:pebble-toss': 2 };
    expect(sim.state.teams.map((t) => t.inventory)).toEqual([want, want]);
    expect(createMatch(base).sim.state.teams[0]?.inventory).toEqual({});
  });
});
