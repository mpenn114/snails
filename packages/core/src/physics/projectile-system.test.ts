import { describe, expect, it } from 'vitest';
import { createInitialState } from '../state/game-state.js';
import { Simulation } from '../sim/simulation.js';
import { SdfGrid } from '../terrain/sdf-grid.js';
import { RngStreams } from '../rng-streams.js';
import { GRAVITY, FIXED_DT } from './ballistics.js';
import { projectileSystem, spawnProjectile } from './projectile-system.js';
import type { SimEvent } from '../sim/types.js';

function make(withGround = true): Simulation {
  const g = new SdfGrid(40, 40, 40, 1);
  if (withGround) {
    for (let z = 0; z < 40; z++)
      for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) g.data[g.index(x, y, z)] = y - 5.5;
  }
  const state = createInitialState({
    seed: 1,
    teams: [
      {
        id: 't',
        name: 'T',
        colour: '#fff',
        snails: [{ id: 's1', name: 'A', position: { x: 30, y: 6, z: 30 } }],
      },
    ],
    terrain: { nx: 40, ny: 40, nz: 40 },
  });
  const sim = new Simulation({ state, terrain: g, rng: new RngStreams(1) });
  sim.addSystem('projectiles', projectileSystem);
  return sim;
}

function run(sim: Simulation, steps: number): SimEvent[] {
  const out: SimEvent[] = [];
  for (let i = 0; i < steps; i++) out.push(...sim.step());
  return out;
}

const Z = { x: 0, y: 0, z: 0 };

describe('projectileSystem', () => {
  it('follows the analytic parabola without wind', () => {
    const sim = make(false);
    spawnProjectile(sim.state, {
      position: { x: 5, y: 20, z: 5 },
      velocity: { x: 4, y: 6, z: 0 },
      ownerSnailId: 's1',
      weaponId: 'w',
    });
    run(sim, 60);
    const p = sim.state.projectiles[0];
    const t = 60 * FIXED_DT;
    expect(p?.position.x).toBeCloseTo(5 + 4 * t, 1);
    // Semi-implicit Euler adds a -g*dt*t/2 drift relative to the exact parabola.
    const exact = 20 + 6 * t - 0.5 * GRAVITY * t * t;
    expect(p?.position.y).toBeCloseTo(exact - 0.5 * GRAVITY * FIXED_DT * t, 6);
    expect(Math.abs((p?.position.y ?? 0) - exact)).toBeLessThan(0.1);
  });
  it('wind deflects along its direction', () => {
    const sim = make(false);
    sim.state.wind = { strength: 4, direction: Math.PI / 2 };
    spawnProjectile(sim.state, {
      position: { x: 5, y: 20, z: 5 },
      velocity: Z,
      ownerSnailId: 's1',
      weaponId: 'w',
    });
    run(sim, 30);
    const p = sim.state.projectiles[0];
    expect(p?.position.z).toBeGreaterThan(5.5);
    expect(Math.abs((p?.position.x ?? 0) - 5)).toBeLessThan(1e-6);
  });
  it('hits the ground and emits an event', () => {
    const sim = make();
    spawnProjectile(sim.state, {
      position: { x: 5, y: 12, z: 5 },
      velocity: Z,
      ownerSnailId: 's1',
      weaponId: 'bazooka',
    });
    const ev = run(sim, 120).filter((e) => e.type === 'projectileHit');
    expect(ev).toHaveLength(1);
    const e = ev[0] as unknown as { normal: { y: number }; weaponId: string; projectileId: string };
    expect(e.weaponId).toBe('bazooka');
    expect(e.projectileId).toBe('p1');
    expect(e.normal.y).toBeGreaterThan(0.9);
    expect(sim.state.projectiles).toHaveLength(0);
  });
  it('hits a snail directly', () => {
    const sim = make();
    spawnProjectile(sim.state, {
      position: { x: 30, y: 10, z: 30 },
      velocity: Z,
      ownerSnailId: 'other',
      weaponId: 'w',
    });
    const ev = run(sim, 60).filter((e) => e.type === 'projectileHit');
    expect((ev[0] as Record<string, unknown> | undefined)?.['snailId']).toBe('s1');
  });
  it('expires out of bounds and by age', () => {
    const sim = make(false);
    spawnProjectile(sim.state, {
      position: { x: 5, y: 20, z: 5 },
      velocity: Z,
      ownerSnailId: 's1',
      weaponId: 'w',
    });
    spawnProjectile(sim.state, {
      position: { x: 5, y: 20, z: 5 },
      velocity: { x: 0, y: 1, z: 0 },
      ownerSnailId: 's1',
      weaponId: 'w',
      gravityScale: 0,
      maxAge: 0.5,
    });
    const ev = run(sim, 240).filter((e) => e.type === 'projectileExpired');
    expect(ev.map((e) => (e as Record<string, unknown>)['projectileId'])).toEqual(['p2', 'p1']);
    expect(sim.state.projectiles).toHaveLength(0);
  });
  it('is deterministic', () => {
    const go = (): unknown => {
      const sim = make();
      sim.state.wind = { strength: 2, direction: 1 };
      spawnProjectile(sim.state, {
        position: { x: 5, y: 20, z: 5 },
        velocity: { x: 8, y: 5, z: 2 },
        ownerSnailId: 's1',
        weaponId: 'w',
      });
      return [run(sim, 200), sim.snapshot()];
    };
    expect(go()).toEqual(go());
  });
});
