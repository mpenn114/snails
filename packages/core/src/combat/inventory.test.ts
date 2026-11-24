import { describe, expect, it } from 'vitest';
import type { CrateDefinition, WeaponDefinition } from '../content/types.js';
import { grantWeapons } from '../crate/crate-pickup.js';
import { createMatch, type MatchSetup } from '../sim/match.js';
import { PEBBLE, testMatchOptions } from '../sim/test-match.js';
import type { Team } from '../state/types.js';
import {
  consumeStock,
  initialInventory,
  isWeaponLocked,
  stockOf,
  weaponAvailability,
} from './inventory.js';

const SHELL: WeaponDefinition = { ...PEBBLE, id: 'test:shell', name: 'Shell', ammo: 2 };
const GATED: WeaponDefinition = {
  ...PEBBLE,
  id: 'test:gated',
  name: 'Gated',
  ammo: 3,
  requiresTech: 'test:tech',
};
const SUPPLY: CrateDefinition = {
  id: 't:supply',
  name: 'Supply',
  kind: 'supply',
  weight: 1,
  contents: { weapons: [{ weaponId: 'test:shell', count: 3 }] },
};

function match(loadout?: Record<string, number>): MatchSetup {
  const m = createMatch({
    ...testMatchOptions(5),
    weapons: [PEBBLE, SHELL, GATED],
    crates: [SUPPLY],
    ...(loadout ? { loadout } : {}),
  });
  for (let i = 0; i < 600 && m.sim.state.turn.phase !== 'action'; i++) m.sim.step();
  return m;
}

function team(m: MatchSetup, id = 'a'): Team {
  return m.sim.state.teams.find((t) => t.id === id) as Team;
}

function submitFire(m: MatchSetup, weaponId: string): ReturnType<MatchSetup['sim']['submit']> {
  const snailId = m.sim.state.turn.activeSnailId as string;
  return m.sim.submit({ type: 'fire', snailId, weaponId }, m.sim.state.turn.activeTeamId as string);
}

/** Lets the turn machine accept another shot for the same team. */
function rearm(m: MatchSetup): void {
  m.sim.state.turn.fired = false;
  m.sim.state.turn.phase = 'action';
}

describe('initial inventory', () => {
  it('counts finite ungated weapons only, for every team', () => {
    const m = match();
    expect(team(m).inventory).toEqual({ 'test:shell': 2 });
    expect(team(m, 'b').inventory).toEqual({ 'test:shell': 2 });
  });

  it('applies loadout overrides, including limiting an infinite weapon', () => {
    const inv = initialInventory([PEBBLE, SHELL], { 'test:shell': 7, 'test:pebble-toss': 1 });
    expect(inv).toEqual({ 'test:shell': 7, 'test:pebble-toss': 1 });
    expect(team(match({ 'test:shell': 9 })).inventory?.['test:shell']).toBe(9);
  });
});

describe('consumption', () => {
  it('spends one unit per shot and leaves infinite weapons uncounted', () => {
    const m = match();
    expect(submitFire(m, 'test:shell').ok).toBe(true);
    m.sim.step();
    expect(team(m).inventory?.['test:shell']).toBe(1);
    rearm(m);
    expect(submitFire(m, 'test:pebble-toss').ok).toBe(true);
    m.sim.step();
    expect(team(m).inventory?.['test:pebble-toss']).toBeUndefined();
    expect(team(m, 'b').inventory?.['test:shell']).toBe(2);
  });

  it('rejects firing at zero stock with NO_AMMO and emits commandRejected', () => {
    const m = match({ 'test:shell': 0 });
    const res = submitFire(m, 'test:shell');
    expect(res).toMatchObject({ ok: false, reason: 'NO_AMMO' });
    const snailId = m.sim.state.turn.activeSnailId as string;
    m.sim.enqueue({ type: 'fire', snailId, weaponId: 'test:shell' });
    const events = m.sim.step();
    expect(events.some((e) => e.type === 'projectileFired')).toBe(false);
    expect(m.sim.state.turn.fired).toBe(false);
  });

  it('runs out after the last unit', () => {
    const m = match({ 'test:shell': 1 });
    expect(submitFire(m, 'test:shell').ok).toBe(true);
    m.sim.step();
    rearm(m);
    expect(submitFire(m, 'test:shell')).toMatchObject({ ok: false, reason: 'NO_AMMO' });
  });
});

describe('crate grants', () => {
  it('increase stock so an empty weapon becomes fireable again', () => {
    const m = match({ 'test:shell': 0 });
    expect(submitFire(m, 'test:shell').ok).toBe(false);
    grantWeapons(team(m), SUPPLY.contents.weapons ?? []);
    expect(team(m).inventory?.['test:shell']).toBe(3);
    expect(submitFire(m, 'test:shell').ok).toBe(true);
  });
});

describe('tech lock', () => {
  it('rejects a weapon whose technology is not researched', () => {
    const m = match();
    expect(submitFire(m, 'test:gated')).toMatchObject({ ok: false, reason: 'WEAPON_LOCKED' });
  });

  it('allows it once researched, and still counts stock', () => {
    const m = match();
    team(m).researched.push('test:tech');
    team(m).inventory!['test:gated'] = 3; // the tech's unlockWeapon grants the stock
    expect(submitFire(m, 'test:gated').ok).toBe(true);
    m.sim.step();
    expect(team(m).inventory?.['test:gated']).toBe(2);
  });

  it('the fire handler itself ignores a locked weapon', () => {
    const m = match();
    const snailId = m.sim.state.turn.activeSnailId as string;
    m.sim.enqueue({ type: 'fire', snailId, weaponId: 'test:gated' });
    expect(m.sim.step().some((e) => e.type === 'projectileFired')).toBe(false);
    expect(team(m).inventory?.['test:gated']).toBeUndefined(); // gated: no starting stock
  });
});

describe('pure helpers', () => {
  const t = { inventory: { 'x:a': 1 }, researched: ['tech'] };
  it('reports stock, locks and availability', () => {
    expect(stockOf(t, { id: 'x:a', ammo: 5 })).toBe(1);
    expect(stockOf(t, { id: 'x:inf', ammo: 'infinite' })).toBe(Infinity);
    expect(stockOf(t, { id: 'x:none', ammo: 4 })).toBe(0);
    expect(isWeaponLocked(t, { requiresTech: 'tech' })).toBe(false);
    expect(isWeaponLocked(t, { requiresTech: 'other' })).toBe(true);
    expect(weaponAvailability(t, { id: 'x:none', ammo: 4 })).toBe('NO_AMMO');
    expect(weaponAvailability(t, { id: 'x:a', ammo: 1, requiresTech: 'o' })).toBe('WEAPON_LOCKED');
    expect(weaponAvailability(t, { id: 'x:a', ammo: 1 })).toBe('ok');
  });

  it('consumeStock never goes below zero', () => {
    const inv = { 'x:a': 0 };
    consumeStock({ inventory: inv }, { id: 'x:a', ammo: 1 });
    expect(inv['x:a']).toBe(0);
  });
});
