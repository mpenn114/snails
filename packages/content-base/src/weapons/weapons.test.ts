import { describe, expect, it } from 'vitest';
import {
  RngStreams,
  SdfGrid,
  Simulation,
  buildMatchContent,
  createInitialState,
  loadContentPacks,
  registerCombat,
  registerLingeringEffects,
  type SimEvent,
  type Vec3,
} from '@snails/core';
import { basePack } from '../index.js';

/** Flat ground at y = 5.5; snail `a1` at x = 8, victim `b1` at `victimAt`. */
function setup(victimAt: Vec3 = { x: 30, y: 6, z: 20 }): Simulation {
  const grid = new SdfGrid(48, 40, 40, 1);
  for (let z = 0; z < 40; z++)
    for (let y = 0; y < 40; y++)
      for (let x = 0; x < 48; x++) grid.data[grid.index(x, y, z)] = y - 5.5;
  const state = createInitialState({
    seed: 1,
    teams: [
      {
        id: 'a',
        name: 'A',
        colour: '#f00',
        snails: [{ id: 'a1', name: 'A', position: { x: 8, y: 6, z: 20 } }],
      },
      { id: 'b', name: 'B', colour: '#00f', snails: [{ id: 'b1', name: 'B', position: victimAt }] },
    ],
    terrain: { nx: 48, ny: 40, nz: 40 },
  });
  const { registries } = loadContentPacks([basePack]);
  const content = buildMatchContent({
    weapons: registries.weapons.list(),
    statuses: registries.statuses.list(),
    areas: registries.areas.list(),
  });
  const sim = new Simulation({ state, terrain: grid, rng: new RngStreams(1) });
  registerCombat(sim, content);
  registerLingeringEffects(sim, content);
  return sim;
}

function fire(sim: Simulation, weaponId: string, power: number): SimEvent[] {
  sim.enqueue({ type: 'aim', snailId: 'a1', angle: Math.PI / 4, power });
  sim.enqueue({ type: 'fire', snailId: 'a1', weaponId });
  const events: SimEvent[] = [];
  for (let i = 0; i < 1200 && (i === 0 || sim.state.projectiles.length > 0); i++) {
    events.push(...sim.step());
  }
  return events;
}

/** Fires once into an empty field to find where the shot lands, then returns that point. */
function landing(weaponId: string, power: number): Vec3 {
  const e = fire(setup({ x: 1, y: 6, z: 1 }), weaponId, power).find(
    (x) => x.type === 'projectileHit',
  );
  if (e?.type !== 'projectileHit') throw new Error('no hit');
  return e.position;
}

describe('base:pebble-toss', () => {
  it('deals 15 damage at the core, carves r=1.5 m and uses no ammo', () => {
    const at = landing('base:pebble-toss', 0.6);
    const sim = setup({ x: at.x, y: 6, z: at.z });
    const events = fire(sim, 'base:pebble-toss', 0.6);
    const hit = events.find((e) => e.type === 'snailDamaged');
    expect(hit).toMatchObject({ snailId: 'b1', amount: 15, cause: 'explosion' });
    expect(sim.state.teams[1]?.snails[0]?.health).toBe(85);
    expect(events.find((e) => e.type === 'terrainCarved')).toMatchObject({ radius: 1.5 });
    expect(events.filter((e) => e.type === 'projectileFired')).toHaveLength(1);
    expect(events.some((e) => e.type === 'statusApplied')).toBe(false);
  });

  it('misses a snail well outside the radius', () => {
    const at = landing('base:pebble-toss', 0.6);
    const sim = setup({ x: at.x + 4, y: 6, z: at.z });
    fire(sim, 'base:pebble-toss', 0.6);
    expect(sim.state.teams[1]?.snails[0]?.health).toBe(100);
  });
});

describe('base:salt-shaker', () => {
  it('fires a cluster of 5 grains that land apart from each other', () => {
    const events = fire(setup(), 'base:salt-shaker', 0.6);
    expect(events.filter((e) => e.type === 'projectileFired')).toHaveLength(5);
    const hits = events.filter((e) => e.type === 'projectileHit');
    expect(hits).toHaveLength(5);
    const xs = hits.map((e) => (e.type === 'projectileHit' ? e.position.x.toFixed(1) : ''));
    expect(new Set(xs).size).toBeGreaterThanOrEqual(3);
  });

  it('deals 8 per grain in r=1 m and salts the victim for 2 turns', () => {
    const at = landing('base:salt-shaker', 0.7);
    const sim = setup({ x: at.x, y: 6, z: at.z });
    const events = fire(sim, 'base:salt-shaker', 0.7);
    const dmg = events.filter((e) => e.type === 'snailDamaged');
    expect(dmg.length).toBeGreaterThan(0);
    expect(dmg.every((e) => e.type === 'snailDamaged' && e.amount <= 8)).toBe(true);
    const victim = sim.state.teams[1]?.snails[0];
    expect(victim?.statuses).toEqual([
      { id: 'base:salt', turnsLeft: 2, magnitude: 1, sourceSnailId: 'a1' },
    ]);
    expect(events.find((e) => e.type === 'statusApplied')).toMatchObject({ statusId: 'base:salt' });
  });

  it('salt does 4 damage at the start of each of the victim team turns for 2 turns', () => {
    const at = landing('base:salt-shaker', 0.7);
    const sim = setup({ x: at.x, y: 6, z: at.z });
    fire(sim, 'base:salt-shaker', 0.7);
    const victim = sim.state.teams[1]?.snails[0];
    const start = victim?.health ?? 0;
    let next = 'a';
    sim.addSystem('test-turn-change', (ctx) => {
      if (ctx.state.turn.activeTeamId === next) return;
      ctx.state.turn.activeTeamId = next;
      ctx.state.turn.turnNumber += 1;
    });
    const startTurnOf = (teamId: string): SimEvent[] => {
      next = teamId;
      if (sim.state.turn.activeTeamId === teamId) sim.state.turn.activeTeamId = 'x';
      return sim.step();
    };
    startTurnOf('a');
    expect(victim?.health).toBe(start);
    startTurnOf('b');
    expect(victim?.health).toBe(start - 4);
    const last = startTurnOf('b');
    expect(victim?.health).toBe(start - 8);
    expect(last.some((e) => e.type === 'statusExpired')).toBe(true);
    startTurnOf('b');
    expect(victim?.health).toBe(start - 8);
    expect(victim?.statuses).toEqual([]);
  });
});
