import { describe, expect, it } from 'vitest';
import {
  RngStreams,
  SdfGrid,
  Simulation,
  buildMatchContent,
  createInitialState,
  loadContentPacks,
  moveCommandHandler,
  movementSystem,
  registerCombat,
  registerLingeringEffects,
  type MatchContent,
  type SimEvent,
  type Vec3,
} from '@snails/core';
import { basePack } from '../index.js';

/** A round pit dug into the flat ground: centre, radius and floor height. */
interface Dip {
  x: number;
  z: number;
  radius: number;
  floor: number;
}

/** Flat ground at y = 5.5, with an optional pit. */
function setup(victimAt: Vec3, dip?: Dip): { sim: Simulation; content: MatchContent } {
  const grid = new SdfGrid(48, 40, 40, 1);
  for (let z = 0; z < 40; z++)
    for (let y = 0; y < 40; y++)
      for (let x = 0; x < 48; x++) {
        const inDip = dip !== undefined && Math.hypot(x - dip.x, z - dip.z) < dip.radius;
        grid.data[grid.index(x, y, z)] = y - (inDip ? dip.floor : 5.5);
      }
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
  return { sim, content };
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

function landing(weaponId: string, power: number): Vec3 {
  const e = fire(setup({ x: 1, y: 6, z: 1 }).sim, weaponId, power).find(
    (x) => x.type === 'projectileHit',
  );
  if (e?.type !== 'projectileHit') throw new Error('no hit');
  return e.position;
}

describe('base:slime-grenade', () => {
  it('deals 25 damage at the core, slimes the victim and leaves a goo splat', () => {
    const at = landing('base:slime-grenade', 0.6);
    const { sim } = setup({ x: at.x, y: 6, z: at.z });
    const events = fire(sim, 'base:slime-grenade', 0.6);
    expect(events.find((e) => e.type === 'snailDamaged')).toMatchObject({
      snailId: 'b1',
      cause: 'explosion',
    });
    const dealt = 100 - (sim.state.teams[1]?.snails[0]?.health ?? 0);
    expect(dealt).toBeGreaterThan(15);
    expect(dealt).toBeLessThanOrEqual(25);
    expect(sim.state.teams[1]?.snails[0]?.statuses?.[0]).toMatchObject({
      id: 'base:goo',
      turnsLeft: 2,
    });
    expect(sim.state.areas).toHaveLength(1);
    expect(sim.state.areas[0]).toMatchObject({ kind: 'base:goo-splat', turnsLeft: 2 });
  });

  it('does not slime a snail outside 3 m', () => {
    const at = landing('base:slime-grenade', 0.6);
    const { sim } = setup({ x: at.x + 5, y: 6, z: at.z });
    fire(sim, 'base:slime-grenade', 0.6);
    expect(sim.state.teams[1]?.snails[0]?.statuses ?? []).toEqual([]);
  });

  it('halves crawl speed while the goo status lasts', () => {
    const crawl = (slimed: boolean): number => {
      const { sim, content } = setup({ x: 30, y: 6, z: 30 });
      sim.registerCommandHandler('move', moveCommandHandler);
      sim.addSystem('movement', movementSystem(undefined, content.statuses));
      const snail = sim.state.teams[1]?.snails[0];
      if (!snail) throw new Error('setup');
      for (let i = 0; i < 5; i++) sim.step();
      if (slimed) {
        snail.statuses = [{ id: 'base:goo', turnsLeft: 2, magnitude: 1, sourceSnailId: 'a1' }];
      }
      const x0 = snail.position.x;
      const z0 = snail.position.z;
      sim.enqueue({ type: 'move', snailId: 'b1', direction: 1 });
      for (let i = 0; i < 60; i++) sim.step();
      return Math.hypot(snail.position.x - x0, snail.position.z - z0);
    };
    const normal = crawl(false);
    const slow = crawl(true);
    expect(normal).toBeGreaterThan(0.5);
    expect(slow / normal).toBeCloseTo(0.5, 1);
  });
});

describe('base:dew-bomb', () => {
  it('deals 5 damage and leaves a 3-turn puddle that does not drown a snail on its rim', () => {
    const at = landing('base:dew-bomb', 0.6);
    const { sim } = setup({ x: at.x + 2.2, y: 6.5, z: at.z });
    const events = fire(sim, 'base:dew-bomb', 0.6);
    expect(events.find((e) => e.type === 'areaCreated')).toMatchObject({ kind: 'base:puddle' });
    expect(sim.state.areas[0]).toMatchObject({ kind: 'base:puddle', turnsLeft: 3 });
    expect(sim.state.areas[0]?.position.y).toBeLessThan(5.5 + 0.3);
    expect(sim.state.teams[1]?.snails[0]?.alive).toBe(true);
  });

  it('does not drown a snail standing in the puddle on flat ground', () => {
    const at = landing('base:dew-bomb', 0.6);
    const { sim } = setup({ x: at.x, y: 6, z: at.z });
    const events = fire(sim, 'base:dew-bomb', 0.6);
    expect(events.some((e) => e.type === 'snailDrowned')).toBe(false);
    expect(sim.state.teams[1]?.snails[0]?.alive).toBe(true);
  });

  it('drowns a snail sitting below the puddle surface in a genuine dip', () => {
    const at = landing('base:dew-bomb', 0.6);
    const dip = { x: at.x, z: at.z, radius: 1.6, floor: 3.5 };
    const { sim } = setup({ x: at.x, y: 4, z: at.z }, dip);
    const events = fire(sim, 'base:dew-bomb', 0.6);
    expect(sim.state.areas[0]?.position.y).toBeCloseTo(3.5 + 0.9, 0);
    expect(events.some((e) => e.type === 'snailDrowned' && e.snailId === 'b1')).toBe(true);
    expect(events.find((e) => e.type === 'snailDied')).toMatchObject({ cause: 'drown' });
    expect(sim.state.teams[1]?.snails[0]?.alive).toBe(false);
  });

  it('extinguishes salt on snails it touches', () => {
    const at = landing('base:dew-bomb', 0.6);
    const { sim } = setup({ x: at.x + 2.2, y: 6, z: at.z });
    const victim = sim.state.teams[1]?.snails[0];
    if (!victim) throw new Error('setup');
    victim.statuses = [{ id: 'base:salt', turnsLeft: 2, magnitude: 1, sourceSnailId: 'a1' }];
    expect(victim.statuses).toHaveLength(1);
    const events = fire(sim, 'base:dew-bomb', 0.6);
    expect(victim.statuses).toEqual([]);
    expect(events.some((e) => e.type === 'statusExpired' && e.statusId === 'base:salt')).toBe(true);
    expect(victim.alive).toBe(true);
  });

  it('puddle expires after 3 turn starts', () => {
    const at = landing('base:dew-bomb', 0.6);
    const { sim } = setup({ x: at.x + 6, y: 6, z: at.z });
    fire(sim, 'base:dew-bomb', 0.6);
    let turn = 10;
    sim.addSystem('turn-bump', (ctx) => {
      ctx.state.turn.turnNumber = turn;
    });
    for (let n = 0; n < 3; n++) {
      turn += 1;
      sim.step();
    }
    expect(sim.state.areas).toHaveLength(0);
  });
});
