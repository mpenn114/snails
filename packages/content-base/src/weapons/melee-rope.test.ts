import { describe, expect, it } from 'vitest';
import {
  RngStreams,
  SdfGrid,
  Simulation,
  buildMatchContent,
  createInitialState,
  loadContentPacks,
  movementSystem,
  registerCombat,
  type SimEvent,
  validateCommand,
  type Vec3,
} from '@snails/core';
import { basePack } from '../index.js';
import { pebbleToss } from './pebble-toss.js';
import { shellBash } from './shell-bash.js';
import { slimeRope } from './slime-rope.js';

const CELL = 0.5;
const NX = 120;
const NY = 60;
const NZ = 80;

type Fill = (x: number, y: number, z: number) => number;

function makeSim(fill: Fill, snails: Record<'a1' | 'b1', Vec3>, withMovement = false): Simulation {
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
  state.teams[0]?.researched.push('slime-rope');
  const { registries } = loadContentPacks([basePack]);
  const content = buildMatchContent({
    weapons: registries.weapons.list(),
    statuses: registries.statuses.list(),
    areas: registries.areas.list(),
  });
  const sim = new Simulation({ state, terrain: grid, rng: new RngStreams(3) });
  if (withMovement) sim.addSystem('movement', movementSystem());
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
const flat: Fill = (_x, y) => y - 10;

describe('base:shell-bash', () => {
  it('damages and shoves an adjacent enemy in front, and never hurts the firer', () => {
    const sim = makeSim(flat, { a1: { x: 10, y: 10.5, z: 20 }, b1: { x: 11.5, y: 10.5, z: 20 } });
    sim.state.turn.phase = 'action';
    const events = fire(sim, shellBash.id, 0, 0);
    const dmg = events.filter((e) => e.type === 'snailDamaged');
    expect(dmg).toHaveLength(1);
    expect(dmg[0]).toMatchObject({ snailId: 'b1', amount: 20 });
    const b = sim.state.teams[1]?.snails[0];
    expect(b?.health).toBe(80);
    expect(b?.velocity.x).toBeGreaterThan(8);
    expect(b?.grounded).toBe(false);
    const a = sim.state.teams[0]?.snails[0];
    expect(a?.health).toBe(100);
    expect(a?.velocity).toEqual({ x: 0, y: 0, z: 0 });
    expect(events.some((e) => e.type === 'meleeStruck')).toBe(true);
    expect(events.some((e) => e.type === 'explosion')).toBe(false);
    expect(events.some((e) => e.type === 'projectileFired')).toBe(false);
    expect(sim.state.projectiles).toHaveLength(0);
    expect(sim.state.turn.fired).toBe(true);
  });

  it('misses an enemy 3 m away and one standing behind', () => {
    const far = makeSim(flat, { a1: { x: 10, y: 10.5, z: 20 }, b1: { x: 13, y: 10.5, z: 20 } });
    expect(fire(far, shellBash.id, 0, 0).some((e) => e.type === 'snailDamaged')).toBe(false);
    const behind = makeSim(flat, { a1: { x: 10, y: 10.5, z: 20 }, b1: { x: 8.5, y: 10.5, z: 20 } });
    expect(fire(behind, shellBash.id, 0, 0).some((e) => e.type === 'snailDamaged')).toBe(false);
  });
});

describe('base:slime-rope', () => {
  /** Ground at y 10, a ledge (top y 13) for 14 <= x < 16 and a tall back wall for x >= 16. */
  const ledge: Fill = (x, y) => {
    if (x >= 16) return y - 20;
    if (x >= 14) return y - 13;
    return y - 10;
  };
  const start: Vec3 = { x: 10, y: 10.5, z: 20 };

  function climb(sim: Simulation): SimEvent[] {
    sim.state.turn.phase = 'action';
    sim.enqueue({ type: 'aim', snailId: 'a1', angle: Math.atan2(4.5, 6), power: 1 });
    sim.enqueue({ type: 'fire', snailId: 'a1', weaponId: slimeRope.id });
    const events: SimEvent[] = [];
    for (let i = 0; i < 120; i++) events.push(...sim.step());
    return events;
  }

  it('reels the snail up to a ledge and leaves the turn in the action phase', () => {
    const sim = makeSim(ledge, { a1: start, b1: FAR }, true);
    const events = climb(sim);
    expect(events.find((e) => e.type === 'ropeAttached')).toBeDefined();
    expect(events.find((e) => e.type === 'ropeReleased')).toBeDefined();
    const a = sim.state.teams[0]?.snails[0];
    expect(a?.rope).toBeUndefined();
    expect(a?.position.x).toBeGreaterThan(14.2);
    expect(a?.position.x).toBeLessThan(16);
    // It landed on the ledge (top at y 13), 3 m above where it started.
    expect(a?.grounded).toBe(true);
    expect(a?.position.y).toBeGreaterThan(13.2);
    expect(a?.position.y).toBeLessThan(14);
    expect(a?.health).toBe(100);
    expect(sim.state.turn.phase).toBe('action');
    expect(sim.state.turn.fired).toBe(false);
    expect(sim.state.projectiles).toHaveLength(0);
  });

  it('is limited to one use per turn and then does nothing', () => {
    const sim = makeSim(ledge, { a1: start, b1: FAR });
    climb(sim);
    sim.enqueue({ type: 'fire', snailId: 'a1', weaponId: slimeRope.id });
    const second = sim.step();
    expect(second.some((e) => e.type === 'projectileFired')).toBe(false);
    expect(sim.state.turn.uses?.[slimeRope.id]).toBe(1);
  });

  it('fizzles in open air and a normal weapon still ends the action phase afterwards', () => {
    const sim = makeSim(ledge, { a1: start, b1: FAR });
    sim.state.turn.phase = 'action';
    sim.enqueue({ type: 'aim', snailId: 'a1', angle: 1.4, power: 1 });
    sim.enqueue({ type: 'fire', snailId: 'a1', weaponId: slimeRope.id });
    const events: SimEvent[] = [];
    for (let i = 0; i < 60; i++) events.push(...sim.step());
    expect(events.some((e) => e.type === 'ropeAttached')).toBe(false);
    expect(sim.state.teams[0]?.snails[0]?.position).toEqual(start);
    sim.enqueue({ type: 'fire', snailId: 'a1', weaponId: pebbleToss.id });
    sim.step();
    expect(sim.state.turn.fired).toBe(true);
    expect(sim.state.turn.phase).toBe('fire');
  });

  it('is rejected by validation once its single use this turn is spent', () => {
    const sim = makeSim(ledge, { a1: start, b1: FAR });
    sim.state.turn.activeSnailId = 'a1';
    sim.state.turn.activeTeamId = 'a';
    sim.state.turn.phase = 'action';
    const { registries } = loadContentPacks([basePack]);
    const cmd = { type: 'fire', snailId: 'a1', weaponId: slimeRope.id } as const;
    const ctx = { weapons: registries.weapons };
    expect(validateCommand(sim.state, cmd, ctx).ok).toBe(true);
    sim.state.turn.uses = { [slimeRope.id]: 1 };
    expect(validateCommand(sim.state, cmd, ctx)).toMatchObject({
      ok: false,
      reason: 'NO_USES_LEFT',
    });
  });
});
