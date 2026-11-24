import { describe, expect, it } from 'vitest';
import {
  MATERIAL_ROCK,
  RngStreams,
  SdfGrid,
  Simulation,
  buildMatchContent,
  createInitialState,
  loadContentPacks,
  predictTrajectory,
  registerCombat,
  type SimEvent,
  type Vec3,
} from '@snails/core';
import { basePack } from '../index.js';
import { pebbleRoller } from './pebble-roller.js';
import { shellDrill } from './shell-drill.js';

const CELL = 0.5;
const NX = 120;
const NY = 60;
const NZ = 80;

type Fill = (x: number, y: number, z: number) => number;

function makeSim(fill: Fill, snails: Record<'a1' | 'b1', Vec3>): Simulation {
  const grid = new SdfGrid(NX, NY, NZ, CELL);
  for (let z = 0; z < NZ; z++)
    for (let y = 0; y < NY; y++)
      for (let x = 0; x < NX; x++) {
        grid.data[grid.index(x, y, z)] = fill(x * CELL, y * CELL, z * CELL);
      }
  const state = createInitialState({
    seed: 3,
    teams: [
      {
        id: 'a',
        name: 'A',
        colour: '#f00',
        snails: [{ id: 'a1', name: 'A', position: snails.a1 }],
      },
      {
        id: 'b',
        name: 'B',
        colour: '#00f',
        snails: [{ id: 'b1', name: 'B', position: snails.b1 }],
      },
    ],
    terrain: { nx: NX, ny: NY, nz: NZ },
  });
  state.wind = { strength: 0, direction: 0 };
  const { registries } = loadContentPacks([basePack]);
  const content = buildMatchContent({
    weapons: registries.weapons.list(),
    statuses: registries.statuses.list(),
    areas: registries.areas.list(),
  });
  const sim = new Simulation({ state, terrain: grid, rng: new RngStreams(3) });
  registerCombat(sim, content);
  return sim;
}

function fire(sim: Simulation, weaponId: string, angle: number, power: number): SimEvent[] {
  sim.enqueue({ type: 'aim', snailId: 'a1', angle, power });
  sim.enqueue({ type: 'fire', snailId: 'a1', weaponId });
  const events: SimEvent[] = [];
  for (let i = 0; i < 600 && (i === 0 || sim.state.projectiles.length > 0); i++) {
    events.push(...sim.step());
  }
  return events;
}

const FAR: Vec3 = { x: 2, y: 2, z: 2 };

describe('base:pebble-roller', () => {
  /** A 17 degree slope falling towards +x, then flat. */
  const slope: Fill = (x, y) => (y - (20 - 0.3 * Math.min(x, 40))) / Math.hypot(1, 0.3);

  it('rolls down a slope without detonating on terrain and bursts at the 4 s fuse', () => {
    const sim = makeSim(slope, { a1: { x: 6, y: 18.5, z: 20 }, b1: FAR });
    sim.enqueue({ type: 'aim', snailId: 'a1', angle: -0.2, power: 0 });
    sim.enqueue({ type: 'fire', snailId: 'a1', weaponId: pebbleRoller.id });
    const events: SimEvent[] = [];
    let firstContactX: number | null = null;
    for (let i = 0; i < 600 && (i === 0 || sim.state.projectiles.length > 0); i++) {
      events.push(...sim.step());
      const p = sim.state.projectiles[0];
      if (p && firstContactX === null && p.position.y < 20 - 0.3 * p.position.x + 0.6) {
        firstContactX = p.position.x;
      }
    }
    expect(events.some((e) => e.type === 'projectileHit')).toBe(false);
    const expired = events.find((e) => e.type === 'projectileExpired');
    expect(expired).toMatchObject({ reason: 'fuse' });
    const boom = events.find((e) => e.type === 'explosion');
    expect(boom).toMatchObject({ radius: 2.5, weaponId: pebbleRoller.id });
    const at = (boom as { position: Vec3 }).position;
    // It kept travelling downhill long after first touching the slope.
    expect(at.x - (firstContactX ?? 0)).toBeGreaterThan(5);
    expect(at.y).toBeLessThan(18.5 - 2);
    expect(sim.state.tick).toBeGreaterThanOrEqual(240);
    expect(sim.state.projectiles).toHaveLength(0);
  });

  it('bounces off flat ground (loses height each time) rather than exploding', () => {
    const flat: Fill = (_x, y) => y - 10;
    const sim = makeSim(flat, { a1: { x: 6, y: 10.5, z: 20 }, b1: FAR });
    sim.enqueue({ type: 'aim', snailId: 'a1', angle: 0.6, power: 0.7 });
    sim.enqueue({ type: 'fire', snailId: 'a1', weaponId: pebbleRoller.id });
    const peaks: number[] = [];
    let prevVy = 0;
    for (let i = 0; i < 230; i++) {
      sim.step();
      const p = sim.state.projectiles[0];
      if (!p) break;
      if (prevVy > 0 && p.velocity.y <= 0) peaks.push(p.position.y);
      prevVy = p.velocity.y;
    }
    expect(peaks.length).toBeGreaterThanOrEqual(3);
    expect(peaks[1] as number).toBeLessThan(peaks[0] as number);
    expect(peaks[2] as number).toBeLessThan(peaks[1] as number);
  });

  it('deals 30 damage at the core of its blast when it touches a snail', () => {
    const flat: Fill = (_x, y) => y - 10;
    const sim = makeSim(flat, { a1: { x: 6, y: 10.5, z: 20 }, b1: { x: 9, y: 10.5, z: 20 } });
    const events = fire(sim, pebbleRoller.id, 0, 0.3);
    const dmg = events.find((e) => e.type === 'snailDamaged' && e.snailId === 'b1');
    expect(dmg).toMatchObject({ snailId: 'b1', cause: 'explosion' });
    expect((dmg as { amount: number }).amount).toBeGreaterThan(15);
    expect((dmg as { amount: number }).amount).toBeLessThanOrEqual(30);
    expect(events.some((e) => e.type === 'projectileHit')).toBe(true);
  });
});

describe('base:shell-drill', () => {
  /** Solid everywhere except a 2 m pocket around the firing snail. */
  const origin: Vec3 = { x: 10, y: 20, z: 20 };
  const pocket: Fill = (x, y, z) => {
    const d = Math.hypot(x - origin.x, y - origin.y, z - origin.z);
    return d < 2 ? 2 - d : -Math.min(d - 2, 3);
  };

  it('is straight in the preview and cut off at its length', () => {
    const wind = { strength: 5, direction: 1 };
    const pts = predictTrajectory(
      origin,
      0,
      { angle: 0, power: 1 },
      shellDrill.launch,
      wind,
      40,
      5,
      shellDrill.motion,
    );
    expect(pts.length).toBeGreaterThan(3);
    expect(pts.length).toBeLessThan(40);
    for (const p of pts) {
      expect(p.y).toBeCloseTo(origin.y, 6);
      expect(p.z).toBeCloseTo(origin.z, 6);
    }
    const last = pts[pts.length - 1] as Vec3;
    expect(last.x - (pts[0] as Vec3).x).toBeGreaterThanOrEqual(8);
    expect(last.x - (pts[0] as Vec3).x).toBeLessThan(10);
  });

  it('tunnels 8 m through soil, deals no damage and ends silently', () => {
    const sim = makeSim(pocket, { a1: origin, b1: FAR });
    const events = fire(sim, shellDrill.id, 0, 1);
    const solidAt = (x: number): boolean => sim.terrain.isSolid({ x, y: 20, z: 20 });
    const start = 10 + 0.75;
    // Open all along the drilled length (start..start + 8) ...
    for (let x = 13; x < start + 7.5; x += 0.5) expect(solidAt(x)).toBe(false);
    // ... and untouched just past the end.
    expect(solidAt(start + 8 + 1.5)).toBe(true);
    expect(solidAt(start + 8 + 3)).toBe(true);
    expect(events.filter((e) => e.type === 'terrainCarved').length).toBeGreaterThan(20);
    expect(events.some((e) => e.type === 'snailDamaged')).toBe(false);
    expect(events.some((e) => e.type === 'projectileHit')).toBe(false);
    expect(events.find((e) => e.type === 'projectileExpired')).toMatchObject({ reason: 'fuse' });
  });

  it('stops at a snail in the tunnel and deals exactly 10', () => {
    const sim = makeSim(pocket, { a1: origin, b1: { x: 15.5, y: 20, z: 20 } });
    const events = fire(sim, shellDrill.id, 0, 1);
    expect(events.find((e) => e.type === 'snailDamaged')).toMatchObject({
      snailId: 'b1',
      amount: 10,
    });
    const hit = events.find((e) => e.type === 'projectileHit');
    expect(hit).toMatchObject({ snailId: 'b1' });
    expect((hit as { position: Vec3 }).position.x).toBeLessThan(15.5);
    expect(sim.terrain.isSolid({ x: 19, y: 20, z: 20 })).toBe(true);
  });

  it('is stopped silently by rock, which a power-20 carve cannot cut', () => {
    const sim = makeSim(pocket, { a1: origin, b1: FAR });
    for (let z = 0; z < NZ; z++)
      for (let y = 0; y < NY; y++)
        for (let x = 0; x < NX; x++) {
          if (x * CELL >= 14 && x * CELL < 16)
            sim.terrain.materials[sim.terrain.index(x, y, z)] = MATERIAL_ROCK;
        }
    const events = fire(sim, shellDrill.id, 0, 1);
    expect(sim.terrain.isSolid({ x: 15.5, y: 20, z: 20 })).toBe(true);
    expect(sim.terrain.isSolid({ x: 17, y: 20, z: 20 })).toBe(true);
    expect(events.some((e) => e.type === 'snailDamaged')).toBe(false);
    expect(events.find((e) => e.type === 'projectileExpired')).toBeDefined();
  });
});
