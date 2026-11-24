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
  windAcceleration,
  type SimEvent,
  type Vec3,
} from '@snails/core';
import { basePack } from '../index.js';

const POWER = 0.6;

/** Flat ground at y = 5.5; snail `a1` at x = 8, victim `b1` at `victimAt`. */
function setup(victimAt: Vec3 = { x: 40, y: 6, z: 36 }): Simulation {
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
  // Gated weapons are locked until researched (M4-15); research everything for these tests.
  for (const t of state.teams) {
    t.researched = registries.weapons
      .list()
      .flatMap((w) => (w.requiresTech ? [w.requiresTech] : []));
  }
  const sim = new Simulation({ state, terrain: grid, rng: new RngStreams(1) });
  registerCombat(sim, content);
  registerLingeringEffects(sim, content);
  return sim;
}

function fire(sim: Simulation, weaponId: string): SimEvent[] {
  sim.enqueue({ type: 'aim', snailId: 'a1', angle: Math.PI / 4, power: POWER });
  sim.enqueue({ type: 'fire', snailId: 'a1', weaponId });
  const events: SimEvent[] = [];
  for (let i = 0; i < 1200 && (i === 0 || sim.state.projectiles.length > 0); i++) {
    events.push(...sim.step());
  }
  return events;
}

/** Fires once into an empty far corner to learn where the shot lands. */
function landing(weaponId: string): Vec3 {
  const e = fire(setup({ x: 1, y: 6, z: 1 }), weaponId).find((x) => x.type === 'projectileHit');
  if (e?.type !== 'projectileHit') throw new Error('no hit');
  return e.position;
}

/** Starts the next turn (alternating teams) and returns that step's events. */
function nextTurn(sim: Simulation): SimEvent[] {
  const team = sim.state.turn.activeTeamId === 'a' ? 'b' : 'a';
  sim.state.turn.activeTeamId = 'x';
  sim.addSystem(`force-${sim.state.tick}`, (ctx) => {
    if (ctx.state.turn.activeTeamId === 'x') {
      ctx.state.turn.activeTeamId = team;
      ctx.state.turn.turnNumber += 1;
    }
  });
  return sim.step();
}

describe('base:spore-cloud', () => {
  it('spawns a 4 m cloud for 3 turns and deals no damage on impact', () => {
    const at = landing('base:spore-cloud');
    const sim = setup({ x: at.x, y: 6, z: at.z });
    const events = fire(sim, 'base:spore-cloud');
    expect(events.find((e) => e.type === 'areaCreated')).toMatchObject({
      kind: 'base:spore-cloud',
      radius: 4,
      turnsLeft: 3,
    });
    expect(events.some((e) => e.type === 'snailDamaged')).toBe(false);
    expect(sim.state.teams[1]?.snails[0]?.health).toBe(100);
  });

  it('deals 6 per turn start to snails inside for 3 turn starts, then expires', () => {
    const at = landing('base:spore-cloud');
    const sim = setup({ x: at.x + 3, y: 6, z: at.z });
    const victim = sim.state.teams[1]?.snails[0];
    fire(sim, 'base:spore-cloud');
    const dmg: SimEvent[] = [];
    for (let i = 0; i < 3; i++) {
      dmg.push(...nextTurn(sim).filter((e) => e.type === 'snailDamaged'));
      expect(victim?.health).toBe(100 - 6 * (i + 1));
    }
    expect(dmg.every((e) => e.type === 'snailDamaged' && e.cause === 'area')).toBe(true);
    expect(sim.state.areas).toHaveLength(0);
    nextTurn(sim);
    expect(victim?.health).toBe(82);
  });

  it('spares snails outside the radius', () => {
    const at = landing('base:spore-cloud');
    const sim = setup({ x: at.x + 6, y: 6, z: at.z });
    fire(sim, 'base:spore-cloud');
    nextTurn(sim);
    expect(sim.state.teams[1]?.snails[0]?.health).toBe(100);
  });

  it('drifts downwind at each turn start', () => {
    const at = landing('base:spore-cloud');
    const sim = setup({ x: 1, y: 6, z: 1 });
    fire(sim, 'base:spore-cloud');
    sim.state.wind = { strength: 3, direction: 0 };
    const x0 = sim.state.areas[0]?.position.x ?? 0;
    const events = nextTurn(sim);
    const moved = events.find((e) => e.type === 'areaMoved');
    expect(moved).toBeDefined();
    expect(sim.state.areas[0]?.position.x).toBeCloseTo(x0 + windAcceleration(sim.state.wind).x);
    expect(at.x).toBeGreaterThan(0);
  });
});

describe('base:beetle-barrage', () => {
  it('schedules six telegraphed shells across a line, 2 turns ahead, with no immediate damage', () => {
    const at = landing('base:beetle-barrage');
    const sim = setup({ x: at.x, y: 6, z: at.z });
    const events = fire(sim, 'base:beetle-barrage');
    const created = events.filter((e) => e.type === 'scheduledCreated');
    expect(created).toHaveLength(6);
    expect(sim.state.scheduled).toHaveLength(6);
    expect(new Set(sim.state.scheduled.map((s) => s.groupId)).size).toBe(1);
    const xs = sim.state.scheduled.map((s) => s.position.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(12);
    expect(sim.state.scheduled.every((s) => s.turnsLeft === 2)).toBe(true);
    expect(sim.state.scheduled.every((s) => Math.abs(s.position.y - 5.5) < 0.2)).toBe(true);
    expect(events.some((e) => e.type === 'snailDamaged')).toBe(false);
  });

  it('shows the line for one full turn, then lands 18 damage per shell', () => {
    const at = landing('base:beetle-barrage');
    // The line spans x +/- 6 around the target with shells every 2.4 m; stand on the second one.
    const sim = setup({ x: at.x - 3.6, y: 6, z: at.z });
    const victim = sim.state.teams[1]?.snails[0];
    fire(sim, 'base:beetle-barrage');
    const first = nextTurn(sim);
    expect(first.some((e) => e.type === 'scheduledFired')).toBe(false);
    expect(sim.state.scheduled).toHaveLength(6);
    expect(victim?.health).toBe(100);
    const second = nextTurn(sim);
    expect(second.filter((e) => e.type === 'scheduledFired')).toHaveLength(6);
    expect(sim.state.scheduled).toHaveLength(0);
    expect(second.filter((e) => e.type === 'terrainCarved')).toHaveLength(6);
    const dmg = second.filter((e) => e.type === 'snailDamaged' && e.snailId === 'b1');
    expect(dmg.length).toBeGreaterThanOrEqual(1);
    expect(dmg[0]).toMatchObject({ cause: 'explosion', sourceSnailId: 'a1' });
    expect(victim?.health).toBeLessThan(100);
    expect(victim?.health).toBeGreaterThanOrEqual(100 - 18 * 3);
  });

  it('is gated by the beetle-callers technology', () => {
    const { registries } = loadContentPacks([basePack]);
    expect(registries.weapons.get('base:beetle-barrage')?.requiresTech).toBe('beetle-callers');
    expect(registries.technologies.has('beetle-callers')).toBe(true);
  });
});

describe('base:snail-mail', () => {
  it('marks the landing point and teleports the firer there at the next turn start', () => {
    const at = landing('base:snail-mail');
    const sim = setup();
    const events = fire(sim, 'base:snail-mail');
    expect(events.find((e) => e.type === 'scheduledCreated')).toMatchObject({
      style: 'arrival',
      turnsLeft: 1,
    });
    const firer = sim.state.teams[0]?.snails[0];
    expect(firer?.position.x).toBeCloseTo(8);
    const turn = nextTurn(sim);
    expect(turn.find((e) => e.type === 'snailMoved')).toMatchObject({ snailId: 'a1' });
    expect(firer?.position.x).toBeCloseTo(at.x, 1);
    expect(firer?.position.z).toBeCloseTo(at.z, 1);
    expect(firer?.alive).toBe(true);
    expect(sim.state.scheduled).toHaveLength(0);
    expect(turn.some((e) => e.type === 'snailDamaged')).toBe(false);
  });
});
