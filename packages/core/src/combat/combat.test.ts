import { describe, expect, it } from 'vitest';
import { ContentRegistry } from '../content/registry.js';
import type { WeaponDefinition } from '../content/types.js';
import { RngStreams } from '../rng-streams.js';
import { Simulation } from '../sim/simulation.js';
import type { SimEvent } from '../sim/events.js';
import { createInitialState } from '../state/game-state.js';
import { SdfGrid } from '../terrain/sdf-grid.js';
import { aimCommandHandler, registerCombat } from './combat.js';

const PEBBLE: WeaponDefinition = {
  id: 'test:pebble-toss',
  name: 'Pebble Toss',
  kind: 'projectile',
  launch: { minSpeed: 5, maxSpeed: 20, gravityScale: 1, windScale: 1, projectileRadius: 0.1 },
  fuseSeconds: 0,
  explosion: { radius: 3, maxDamage: 30, knockback: 5, falloff: 'linear' },
  ammo: 'infinite',
};

function setup(weapon: WeaponDefinition = PEBBLE): Simulation {
  const g = new SdfGrid(40, 40, 40, 1);
  for (let z = 0; z < 40; z++)
    for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) g.data[g.index(x, y, z)] = y - 5.5;
  const state = createInitialState({
    seed: 1,
    teams: [
      {
        id: 'a',
        name: 'A',
        colour: '#f00',
        snails: [{ id: 'sa', name: 'A', position: { x: 8, y: 6, z: 20 } }],
      },
      {
        id: 'b',
        name: 'B',
        colour: '#00f',
        snails: [{ id: 'sb', name: 'B', position: { x: 18, y: 6, z: 20 } }],
      },
    ],
    terrain: { nx: 40, ny: 40, nz: 40 },
  });
  const weapons = new ContentRegistry<WeaponDefinition>();
  weapons.register(weapon);
  const sim = new Simulation({ state, terrain: g, rng: new RngStreams(1) });
  registerCombat(sim, { weapons });
  return sim;
}

function play(weapon?: WeaponDefinition): { events: SimEvent[]; sim: Simulation } {
  const sim = setup(weapon);
  sim.enqueue({ type: 'aim', snailId: 'sa', angle: Math.PI / 4, power: 0.33 });
  sim.enqueue({ type: 'fire', snailId: 'sa', weaponId: PEBBLE.id });
  const events: SimEvent[] = [];
  for (let i = 0; i < 1200 && (i === 0 || sim.state.projectiles.length > 0); i++) {
    events.push(...sim.step());
  }
  return { events, sim };
}

describe('combat', () => {
  it('fires Pebble Toss, hits, explodes and damages the target deterministically', () => {
    const a = play();
    const types = a.events.map((e) => e.type);
    for (const t of ['projectileFired', 'projectileHit', 'explosion', 'snailDamaged']) {
      expect(types).toContain(t);
    }
    expect(a.sim.state.teams[1]!.snails[0]!.health).toBeLessThan(100);
    expect(a.sim.state.projectiles).toHaveLength(0);
    const b = play();
    expect(b.events).toEqual(a.events);
    expect(b.sim.snapshot()).toEqual(a.sim.snapshot());
  });

  it('detonates fused weapons at expiry instead of vanishing', () => {
    const { events } = play({ ...PEBBLE, fuseSeconds: 0.5 });
    const types = events.map((e) => e.type);
    expect(types).toContain('projectileExpired');
    expect(types).toContain('explosion');
  });

  it('turns the snail to the aim facing and fires the projectile that way', () => {
    const sim = setup();
    sim.enqueue({ type: 'aim', snailId: 'sa', angle: 0, power: 0.5, facing: Math.PI });
    sim.step();
    const snail = sim.state.teams[0]!.snails[0]!;
    // setFacing normalises to [-PI, PI), so PI is stored as -PI.
    expect(Math.abs(snail.facing)).toBeCloseTo(Math.PI, 9);
    sim.enqueue({ type: 'fire', snailId: 'sa', weaponId: PEBBLE.id });
    sim.step();
    const [shot] = sim.state.projectiles;
    expect(shot).toBeDefined();
    expect(shot!.velocity.x).toBeLessThan(0);
    expect(Math.abs(shot!.velocity.z)).toBeLessThan(1e-9);
  });

  it('keeps the current facing when aim has no facing', () => {
    const sim = setup();
    sim.enqueue({ type: 'aim', snailId: 'sa', angle: 0.2, power: 0.5 });
    sim.step();
    expect(sim.state.teams[0]!.snails[0]!.facing).toBe(0);
  });

  it('clamps aim and ignores unknown weapons', () => {
    const sim = setup();
    aimCommandHandler(
      { state: sim.state, terrain: sim.terrain, rng: sim.rng, dt: 0, emit: () => undefined },
      { type: 'aim', snailId: 'sa', angle: 9, power: -3 },
    );
    expect(sim.state.teams[0]!.snails[0]!.aim).toEqual({ angle: Math.PI / 2, power: 0 });
    sim.enqueue({ type: 'fire', snailId: 'sa', weaponId: 'nope' });
    sim.step();
    expect(sim.state.projectiles).toHaveLength(0);
  });
});
