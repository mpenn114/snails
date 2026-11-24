import { describe, expect, it } from 'vitest';
import {
  RngStreams,
  SdfGrid,
  Simulation,
  buildMatchContent,
  createInitialState,
  loadContentPacks,
  registerCombat,
  type SimEvent,
  type Vec3,
} from '@snails/core';
import { basePack } from '../index.js';

const MISSILE = 'base:radula-missile';

/** Flat ground at y = 5.5; snail `a1` at x = 8, victim `b1` at `victimAt`. */
function setup(victimAt: Vec3): Simulation {
  const grid = new SdfGrid(64, 40, 40, 1);
  for (let z = 0; z < 40; z++)
    for (let y = 0; y < 40; y++)
      for (let x = 0; x < 64; x++) grid.data[grid.index(x, y, z)] = y - 5.5;
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
    terrain: { nx: 64, ny: 40, nz: 40 },
  });
  state.wind = { strength: 0, direction: 0 };
  const { registries } = loadContentPacks([basePack]);
  const content = buildMatchContent({
    weapons: registries.weapons.list(),
    statuses: registries.statuses.list(),
    areas: registries.areas.list(),
  });
  // Gated weapons are locked until researched; research everything for these tests.
  for (const t of state.teams) {
    for (const w of registries.weapons.list()) {
      if (w.ammo !== 'infinite') (t.inventory ??= {})[w.id] = w.ammo;
    }
    t.researched = registries.weapons
      .list()
      .flatMap((w) => (w.requiresTech ? [w.requiresTech] : []));
  }
  const sim = new Simulation({ state, terrain: grid, rng: new RngStreams(1) });
  registerCombat(sim, content);
  return sim;
}

/** Fires the missile (angle 45 degrees, power 0.6), steering with `input` after launch. */
function shoot(sim: Simulation, input: number): SimEvent[] {
  sim.enqueue({ type: 'aim', snailId: 'a1', angle: Math.PI / 4, power: 0.6 });
  sim.enqueue({ type: 'fire', snailId: 'a1', weaponId: MISSILE });
  const events = sim.step();
  if (input !== 0) sim.enqueue({ type: 'steer', snailId: 'a1', input });
  for (let i = 0; i < 1200 && sim.state.projectiles.length > 0; i++) events.push(...sim.step());
  return events;
}

function landing(input: number): Vec3 {
  const hit = shoot(setup({ x: 1, y: 6, z: 1 }), input).find((e) => e.type === 'projectileHit');
  if (hit?.type !== 'projectileHit') throw new Error('no hit');
  return hit.position;
}

describe('base:radula-missile', () => {
  it('steering moves the landing point, each way differently, deterministically', () => {
    const straight = landing(0);
    const clockwise = landing(1);
    const counter = landing(-1);
    expect(landing(1)).toEqual(clockwise);
    expect(Math.abs(clockwise.x - straight.x)).toBeGreaterThan(1);
    expect(Math.abs(counter.x - clockwise.x)).toBeGreaterThan(1);
  });

  it('deals up to 35 damage and carves r = 2.5 m', () => {
    const at = landing(0);
    const sim = setup({ x: at.x, y: 6, z: at.z });
    const events = shoot(sim, 0);
    const dmg = events.find((e) => e.type === 'snailDamaged');
    expect(dmg).toMatchObject({ snailId: 'b1' });
    // 35 at the exact core; the hit point is on the ground just below the snail.
    expect(dmg?.type === 'snailDamaged' ? dmg.amount : 0).toBeGreaterThan(30);
    expect(dmg?.type === 'snailDamaged' ? dmg.amount : 99).toBeLessThanOrEqual(35);
    expect(events.find((e) => e.type === 'terrainCarved')).toMatchObject({ radius: 2.5 });
  });
});
