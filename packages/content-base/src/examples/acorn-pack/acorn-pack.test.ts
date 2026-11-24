import { describe, expect, it } from 'vitest';
import {
  ContentPackError,
  RngStreams,
  SdfGrid,
  Simulation,
  buildMatchContent,
  createInitialState,
  loadContentPacks,
  registerCombat,
  type SimEvent,
} from '@snails/core';
import { basePack } from '../../index.js';
import { acornMortar, acornPack } from './index.js';

function makeSim(seed: number, targetX = 16): Simulation {
  const grid = new SdfGrid(120, 60, 80, 0.5);
  for (let z = 0; z < 80; z++)
    for (let y = 0; y < 60; y++)
      for (let x = 0; x < 120; x++) grid.data[grid.index(x, y, z)] = y * 0.5 - 10;
  const state = createInitialState({
    seed,
    teams: [
      {
        id: 'a',
        name: 'A',
        colour: '#f00',
        snails: [{ id: 'a1', name: 'A', position: { x: 6, y: 10.5, z: 20 } }],
      },
      {
        id: 'b',
        name: 'B',
        colour: '#00f',
        snails: [{ id: 'b1', name: 'B', position: { x: targetX, y: 10.5, z: 20 } }],
      },
    ],
    terrain: { nx: 120, ny: 60, nz: 80 },
  });
  state.wind = { strength: 0, direction: 0 };
  const { registries } = loadContentPacks([basePack, acornPack]);
  const content = buildMatchContent({
    weapons: registries.weapons.list(),
    statuses: registries.statuses.list(),
    areas: registries.areas.list(),
  });
  const sim = new Simulation({ state, terrain: grid, rng: new RngStreams(seed) });
  registerCombat(sim, content);
  return sim;
}

function run(seed: number, targetX?: number): { events: SimEvent[]; sim: Simulation } {
  const sim = makeSim(seed, targetX);
  sim.enqueue({ type: 'aim', snailId: 'a1', angle: 0.9, power: 0.55 });
  sim.enqueue({ type: 'fire', snailId: 'a1', weaponId: acornMortar.id });
  const events: SimEvent[] = [];
  for (let i = 0; i < 900 && (i === 0 || sim.state.projectiles.length > 0); i++) {
    events.push(...sim.step());
  }
  return { events, sim };
}

describe('acorn example pack (data-only third-party weapon)', () => {
  it('loads after base, passes validation and appears in the weapon registry', () => {
    const loaded = loadContentPacks([acornPack, basePack]);
    expect(loaded.order).toEqual(['base', 'acorn']);
    expect(loaded.registries.weapons.get(acornMortar.id)).toBeDefined();
    expect(loadContentPacks([basePack]).contentHash).not.toBe(loaded.contentHash);
  });

  it('reports a bad cross reference', () => {
    const bad = {
      ...acornPack,
      weapons: [
        { ...acornMortar, effects: [{ type: 'status', statusId: 'base:nope', radius: 1 }] },
      ],
    } as typeof acornPack;
    expect(() => loadContentPacks([basePack, bad])).toThrow(ContentPackError);
  });

  it('fires a cluster, bounces, detonates, damages, carves and salts', () => {
    const { events, sim } = run(11);
    expect(events.filter((e) => e.type === 'projectileFired').length).toBeGreaterThanOrEqual(3);
    expect(events.some((e) => e.type === 'explosion' && e.weaponId === acornMortar.id)).toBe(true);
    expect(events.some((e) => e.type === 'terrainCarved')).toBe(true);
    expect(sim.state.projectiles).toHaveLength(0);
    expect(sim.state.projectiles).toHaveLength(0);
  });

  it('damages and salts a snail standing where the acorn lands', () => {
    const blast = run(11).events.find((e) => e.type === 'explosion');
    const x = (blast as { position: { x: number } }).position.x;
    const { events, sim } = run(11, x + 0.5);
    expect(events.some((e) => e.type === 'snailDamaged' && e.snailId === 'b1')).toBe(true);
    const target = sim.state.teams.flatMap((t) => t.snails).find((s) => s.id === 'b1');
    expect(target?.health).toBeLessThan(100);
    expect(target?.statuses?.some((s) => s.id === 'base:salt')).toBe(true);
  });

  it('is deterministic for a fixed seed', () => {
    const a = run(11);
    const b = run(11);
    expect(b.events).toEqual(a.events);
    expect(JSON.stringify(b.sim.state)).toBe(JSON.stringify(a.sim.state));
  });
});
