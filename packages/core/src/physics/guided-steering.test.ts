import { describe, expect, it } from 'vitest';
import { RngStreams } from '../rng-streams.js';
import { createInitialState } from '../state/game-state.js';
import { SdfGrid } from '../terrain/sdf-grid.js';
import { Simulation } from '../sim/simulation.js';
import { registerCombat } from '../combat/combat.js';
import { buildMatchContent } from '../content/match-content.js';
import type { WeaponDefinition } from '../content/types.js';
import { FIXED_DT } from './ballistics.js';
import { stepMotion } from './motion.js';

const MISSILE: WeaponDefinition = {
  id: 'test:missile',
  name: 'Missile',
  category: 'guided',
  launch: { minSpeed: 8, maxSpeed: 8, gravityScale: 0, windScale: 0, projectileRadius: 0.2 },
  fuseSeconds: 10,
  motion: { kind: 'guided', steerRate: 1, guidanceSeconds: 1 },
  effects: [{ type: 'damage', radius: 1, maxDamage: 10, knockback: 0, falloff: 'linear' }],
  ammo: 2,
};

/** Open air (no terrain), snail a1 at mid-height; the missile is fired along +X, level. */
function setup(): Simulation {
  const grid = new SdfGrid(64, 64, 8, 1);
  grid.data.fill(10);
  const state = createInitialState({
    seed: 1,
    teams: [
      {
        id: 'a',
        name: 'A',
        colour: '#f00',
        snails: [{ id: 'a1', name: 'A', position: { x: 4, y: 32, z: 4 } }],
      },
      {
        id: 'b',
        name: 'B',
        colour: '#00f',
        snails: [{ id: 'b1', name: 'B', position: { x: 60, y: 60, z: 4 } }],
      },
    ],
    terrain: { nx: 64, ny: 64, nz: 8 },
  });
  state.turn.phase = 'action';
  state.turn.activeTeamId = 'a';
  state.turn.activeSnailId = 'a1';
  state.wind = { strength: 0, direction: 0 };
  const sim = new Simulation({ state, terrain: grid, rng: new RngStreams(1) });
  registerCombat(sim, buildMatchContent({ weapons: [MISSILE] }));
  sim.enqueue({ type: 'aim', snailId: 'a1', angle: 0, power: 1 });
  sim.enqueue({ type: 'fire', snailId: 'a1', weaponId: MISSILE.id });
  sim.step();
  return sim;
}

function run(input: number, n: number): Simulation {
  const sim = setup();
  sim.state.turn.phase = 'fire';
  if (input !== 0) sim.enqueue({ type: 'steer', snailId: 'a1', input });
  for (let i = 0; i < n; i++) sim.step();
  return sim;
}

describe('guided motion', () => {
  it('flies straight without steering', () => {
    const p = run(0, 30).state.projectiles[0];
    expect(p?.position.y).toBeCloseTo(32, 6);
  });

  it('steering bends the path deterministically and keeps speed', () => {
    const a = run(1, 30).state.projectiles[0];
    const b = run(1, 30).state.projectiles[0];
    expect(a?.position).toEqual(b?.position);
    expect(a?.position.y).toBeLessThan(31);
    const up = run(-1, 30).state.projectiles[0];
    expect(up?.position.y).toBeGreaterThan(33);
    expect(Math.hypot(a?.velocity.x ?? 0, a?.velocity.y ?? 0)).toBeCloseTo(8, 6);
  });

  it('stops steering after the guidance window', () => {
    const sim = run(1, 59);
    for (let i = 0; i < 5; i++) sim.step();
    const settled = { ...sim.state.projectiles[0]?.velocity };
    expect(settled.y).toBeLessThan(0);
    // The window (1 s = 60 steps) is over: fresh input no longer changes the flight.
    sim.enqueue({ type: 'steer', snailId: 'a1', input: -1 });
    for (let i = 0; i < 10; i++) sim.step();
    expect(sim.state.projectiles[0]?.velocity).toEqual(settled);
  });

  it('only steers the projectiles its snail owns', () => {
    const sim = setup();
    const p = sim.state.projectiles[0];
    if (p) p.ownerSnailId = 'b1';
    sim.state.turn.phase = 'fire';
    sim.enqueue({ type: 'steer', snailId: 'a1', input: 1 });
    sim.step();
    expect(sim.state.projectiles[0]?.steer).toBeUndefined();
  });

  it('stepMotion rotates by steerRate * dt', () => {
    const p = {
      position: { x: 0, y: 0, z: 0 },
      velocity: { x: 8, y: 0, z: 0 },
      gravityScale: 0,
      windScale: 0,
      age: 0,
      steer: 1,
      motion: { kind: 'guided', steerRate: 1, guidanceSeconds: 1 } as const,
    };
    const next = stepMotion(p, { strength: 0, direction: 0 }, FIXED_DT);
    expect(Math.atan2(next.velocity.y, next.velocity.x)).toBeCloseTo(-FIXED_DT, 9);
  });
});
