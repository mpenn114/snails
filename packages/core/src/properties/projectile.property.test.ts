import { describe, expect, it } from 'vitest';
import { stepProjectile, type ProjectileState } from '../physics/ballistics.js';
import { projectileSystem, spawnProjectile } from '../physics/projectile-system.js';
import { RngStreams } from '../rng-streams.js';
import type { Rng } from '../rng.js';
import { Simulation } from '../sim/simulation.js';
import { createInitialState } from '../state/game-state.js';
import type { Wind } from '../state/types.js';
import { SdfGrid } from '../terrain/sdf-grid.js';
import { caseLabel, caseRng, PROPERTY_CASES } from './property-helpers.js';

const BASE_SEED = 0xba111571;
const STEPS = 300;

/** Random projectile state with per-weapon scales in 0..1. */
function randomProjectile(rng: Rng): ProjectileState {
  return {
    position: { x: rng.range(-20, 20), y: rng.range(0, 30), z: rng.range(-20, 20) },
    velocity: { x: rng.range(-30, 30), y: rng.range(-30, 30), z: rng.range(-30, 30) },
    gravityScale: rng.next(),
    windScale: rng.next(),
  };
}

/** Random wind with strength 0..15 m/s^2 and any heading. */
function randomWind(rng: Rng): Wind {
  return { strength: rng.range(0, 15), direction: rng.range(0, Math.PI * 2) };
}

/** Exact (Object.is) comparison of two projectile states, returning the first mismatch. */
function firstMismatch(a: ProjectileState, b: ProjectileState): string | null {
  const pairs: [string, number, number][] = [
    ['position.x', a.position.x, b.position.x],
    ['position.y', a.position.y, b.position.y],
    ['position.z', a.position.z, b.position.z],
    ['velocity.x', a.velocity.x, b.velocity.x],
    ['velocity.y', a.velocity.y, b.velocity.y],
    ['velocity.z', a.velocity.z, b.velocity.z],
  ];
  for (const [name, x, y] of pairs) {
    if (!Object.is(x, y)) return `${name}: ${x} vs ${y}`;
  }
  return null;
}

/** Runs `steps` integration steps from a starting state and returns the final state. */
function integrate(start: ProjectileState, wind: Wind, steps: number): ProjectileState {
  let p = start;
  for (let i = 0; i < steps; i++) p = stepProjectile(p, wind);
  return p;
}

/** Flat empty arena with a projectile system; no terrain so projectiles only fly. */
function flatSim(seed: number): Simulation {
  const grid = new SdfGrid(24, 24, 24, 1, 1);
  const state = createInitialState({
    seed,
    teams: [
      {
        id: 't',
        name: 'T',
        colour: '#fff',
        snails: [{ id: 's1', name: 'A', position: { x: 12, y: 6, z: 12 } }],
      },
    ],
    terrain: { nx: 24, ny: 24, nz: 24 },
  });
  const sim = new Simulation({ state, terrain: grid, rng: new RngStreams(seed) });
  sim.addSystem('projectiles', projectileSystem);
  return sim;
}

describe('projectile stepping properties', () => {
  it('stepProjectile is bit-identical for the same inputs over N steps', () => {
    for (let c = 0; c < PROPERTY_CASES; c++) {
      const rng = caseRng(BASE_SEED, c);
      const start = randomProjectile(rng);
      const wind = randomWind(rng);
      const a = integrate(start, wind, STEPS);
      const b = integrate({ ...start, position: { ...start.position } }, { ...wind }, STEPS);
      const diff = firstMismatch(a, b);
      expect(
        diff,
        `${caseLabel('ballistics', BASE_SEED, c)} after ${STEPS} steps ${diff}`,
      ).toBeNull();
    }
  });

  it('projectileSystem positions are bit-identical across two runs of the same spawns', () => {
    for (let c = 0; c < PROPERTY_CASES / 4; c++) {
      const rng = caseRng(BASE_SEED + 1, c);
      const inits = Array.from({ length: 3 }, () => randomProjectile(rng));
      const windStrength = rng.range(0, 10);
      const windDirection = rng.range(0, Math.PI * 2);
      const run = (): Simulation => {
        const sim = flatSim(c);
        sim.state.wind = { strength: windStrength, direction: windDirection };
        for (const p of inits) {
          spawnProjectile(sim.state, {
            position: p.position,
            velocity: p.velocity,
            ownerSnailId: 's1',
            weaponId: 'w',
            gravityScale: p.gravityScale,
            windScale: p.windScale,
            maxAge: 1e6,
          });
        }
        for (let i = 0; i < 120; i++) sim.step();
        return sim;
      };
      const a = run();
      const b = run();
      const label = caseLabel('projectile-system', BASE_SEED + 1, c);
      expect(a.state.projectiles.length, label).toBe(b.state.projectiles.length);
      for (let i = 0; i < a.state.projectiles.length; i++) {
        const pa = a.state.projectiles[i];
        const pb = b.state.projectiles[i];
        if (!pa || !pb) throw new Error(`${label} missing projectile ${i}`);
        const diff = firstMismatch(pa, pb);
        expect(diff, `${label} projectile ${pa.id} ${diff}`).toBeNull();
      }
    }
  });
});
