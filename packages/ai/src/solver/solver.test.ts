import { describe, expect, it } from 'vitest';
import {
  createMatch,
  distance,
  livingSnails,
  type SdfGrid,
  type Snail,
  type Vec3,
  type WeaponDefinition,
} from '@snails/core';
import { predictImpact, solveAim } from './index.js';

const WEAPON: WeaponDefinition = {
  id: 'test:lob',
  name: 'Lob',
  category: 'projectile',
  launch: { minSpeed: 5, maxSpeed: 26, gravityScale: 1, windScale: 1, projectileRadius: 0.1 },
  fuseSeconds: 0,
  effects: [{ type: 'carve', radius: 2 }],
  ammo: 'infinite',
};

function makeScene(wall = false): { sim: ReturnType<typeof createMatch>['sim']; shooter: Snail } {
  const { sim } = createMatch({
    seed: 7,
    teams: [
      { id: 'a', name: 'A', colour: '#f00', snailNames: ['A1'] },
      { id: 'b', name: 'B', colour: '#00f', snailNames: ['B1'] },
    ],
    terrain: {
      nx: 64,
      ny: 48,
      nz: 64,
      cellSize: 1,
      caveDensity: 0,
      islandFalloff: false,
      baseHeight: 8,
    },
    turn: { introDuration: 0.2, retreatDuration: 0.5, maxTurns: 60 },
    weapons: [WEAPON],
  });
  const g: SdfGrid = sim.terrain;
  for (let z = 0; z < g.nz; z++)
    for (let y = 0; y < g.ny; y++)
      for (let x = 0; x < g.nx; x++) {
        const solidWall = wall && x >= 24 && x <= 26 && y < 30;
        g.data[g.index(x, y, z)] = solidWall ? -1 : y - 5.5;
      }
  const shooter = livingSnails(sim.state)[0] as Snail;
  shooter.position = { x: 10, y: 6, z: 32 };
  return { sim, shooter };
}

const TARGET: Vec3 = { x: 40, y: 6, z: 32 };

describe('aiming solver', () => {
  it('hits flat ground without wind', () => {
    const { sim, shooter } = makeScene();
    sim.state.wind = { strength: 0, direction: 0 };
    const r = solveAim(sim.state, sim.terrain, shooter, WEAPON, TARGET, { samples: 150 });
    expect(r.miss).toBeLessThan(1);
    const hit = predictImpact(sim.state, sim.terrain, shooter, WEAPON, r);
    expect(distance(hit.position, TARGET)).toBeCloseTo(r.miss, 6);
  });

  it('compensates strong wind', () => {
    const { sim, shooter } = makeScene();
    sim.state.wind = { strength: 0, direction: 0 };
    const calm = solveAim(sim.state, sim.terrain, shooter, WEAPON, TARGET, { samples: 300 });
    sim.state.wind = { strength: 4, direction: Math.PI / 2 };
    const windy = solveAim(sim.state, sim.terrain, shooter, WEAPON, TARGET, { samples: 300 });
    expect(windy.miss).toBeLessThan(1.5);
    expect(Math.abs(windy.facing - calm.facing)).toBeGreaterThan(0.01);
  });

  it('lobs over a wall or reports a miss without throwing', () => {
    const { sim, shooter } = makeScene(true);
    sim.state.wind = { strength: 0, direction: 0 };
    const r = solveAim(sim.state, sim.terrain, shooter, WEAPON, TARGET, { samples: 500 });
    expect(Number.isFinite(r.miss)).toBe(true);
    expect(r.miss).toBeLessThan(3);
    expect(r.angle).toBeGreaterThan(0.6);
  });

  it('stays fast at 500 samples', () => {
    const { sim, shooter } = makeScene();
    const t0 = performance.now();
    const r = solveAim(sim.state, sim.terrain, shooter, WEAPON, TARGET, { samples: 500 });
    const ms = performance.now() - t0;
    console.log(`solveAim@500: ${ms.toFixed(1)} ms, miss ${r.miss.toFixed(3)}`);
    expect(ms).toBeLessThan(1000);
  });

  it('is deterministic', () => {
    const { sim, shooter } = makeScene();
    const a = solveAim(sim.state, sim.terrain, shooter, WEAPON, TARGET, { samples: 100 });
    const b = solveAim(sim.state, sim.terrain, shooter, WEAPON, TARGET, { samples: 100 });
    expect(a).toEqual(b);
  });

  it('does not mutate state', () => {
    const { sim, shooter } = makeScene();
    const before = JSON.stringify(sim.state);
    solveAim(sim.state, sim.terrain, shooter, WEAPON, TARGET, { samples: 40 });
    expect(JSON.stringify(sim.state)).toBe(before);
  });

  it('predicts what a real match does (with wind)', () => {
    const { sim } = makeScene();
    let guard = 0;
    while (sim.state.turn.phase !== 'action' && guard++ < 600) sim.step();
    const active = livingSnails(sim.state).find((s) => s.id === sim.state.turn.activeSnailId);
    const snail = active as Snail;
    snail.position = { x: 10, y: 6, z: 32 };
    sim.state.wind = { strength: 2, direction: 1 };
    const aim = { angle: 0.8, power: 0.7, facing: 0.3 };
    const predicted = predictImpact(sim.state, sim.terrain, snail, WEAPON, aim);
    sim.submit({ type: 'aim', snailId: snail.id, ...aim }, snail.teamId);
    sim.submit({ type: 'fire', snailId: snail.id, weaponId: WEAPON.id }, snail.teamId);
    let actual: Vec3 | undefined;
    for (let i = 0; i < 1200 && !actual; i++) {
      for (const e of sim.step()) if (e.type === 'projectileHit') actual = e.position;
    }
    expect(actual).toBeDefined();
    expect(distance(actual as Vec3, predicted.position)).toBeLessThan(0.5);
  });
});
