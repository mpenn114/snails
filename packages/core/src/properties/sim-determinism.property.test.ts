import { describe, expect, it } from 'vitest';
import { ContentRegistry } from '../content/registry.js';
import type { WeaponDefinition } from '../content/types.js';
import { registerCombat } from '../combat/combat.js';
import { Rng } from '../rng.js';
import { RngStreams } from '../rng-streams.js';
import { Simulation } from '../sim/simulation.js';
import type { Command, SimEvent } from '../sim/types.js';
import { createInitialState } from '../state/game-state.js';
import { findSpawnPoints, generateTerrain, type TerrainGenConfig } from '../terrain/generator.js';
import type { Vec3 } from '../state/types.js';
import { caseLabel, fnv1aBytes, sameBytes } from './property-helpers.js';

const BASE_SEED = 0x5ca1ab1e;
const TICKS = 300;
const CASES = 8;

/** Small terrain config so each generated arena is cheap to build. */
const SMALL_TERRAIN: TerrainGenConfig = {
  nx: 32,
  ny: 24,
  nz: 32,
  cellSize: 0.5,
  baseHeight: 5,
  hillAmplitude: 2,
  hillFrequency: 0.04,
  octaves: 3,
  caveDensity: 0.25,
  caveFrequency: 0.08,
  waterLevel: 2,
  islandFalloff: true,
};

const PEBBLE: WeaponDefinition = {
  id: 'test:pebble-toss',
  name: 'Pebble Toss',
  kind: 'projectile',
  launch: { minSpeed: 5, maxSpeed: 20, gravityScale: 1, windScale: 1, projectileRadius: 0.1 },
  fuseSeconds: 0,
  explosion: { radius: 1.5, maxDamage: 30, knockback: 5, falloff: 'linear' },
  ammo: 'infinite',
};

/** Builds a fresh simulation for a seed: generated terrain, two snails, combat registered. */
function buildSim(seed: number): { sim: Simulation; checksum: number; raw: Float32Array } {
  const streams = new RngStreams(seed);
  const { grid, descriptor } = generateTerrain(SMALL_TERRAIN, streams.terrain);
  const spawns: Vec3[] = findSpawnPoints(grid, descriptor, 2, streams.terrain, 4);
  const snailAt = (i: number): Vec3 => spawns[i] ?? { x: 4 + i * 8, y: 8, z: 8 };
  const state = createInitialState({
    seed,
    teams: [
      {
        id: 'a',
        name: 'A',
        colour: '#f00',
        snails: [{ id: 'sa', name: 'A', position: snailAt(0) }],
      },
      {
        id: 'b',
        name: 'B',
        colour: '#00f',
        snails: [{ id: 'sb', name: 'B', position: snailAt(1) }],
      },
    ],
    terrain: descriptor,
  });
  const weapons = new ContentRegistry<WeaponDefinition>();
  weapons.register(PEBBLE);
  const sim = new Simulation({ state, terrain: grid, rng: streams });
  registerCombat(sim, { weapons });
  return { sim, checksum: fnv1aBytes(grid.data), raw: grid.data.slice() };
}

/** Command script derived from a seed: aim and fire intents at random ticks. */
function commandFor(rng: Rng, tick: number): Command | null {
  const r = rng.next();
  const snailId = rng.next() < 0.5 ? 'sa' : 'sb';
  if (r < 0.15) {
    return {
      type: 'aim',
      snailId,
      angle: rng.range(-Math.PI / 2, Math.PI / 2),
      power: rng.next(),
    };
  }
  if (tick % 10 === 0 && r < 0.6) return { type: 'fire', snailId, weaponId: PEBBLE.id };
  return null;
}

/** Runs a simulation for TICKS steps with a seeded command script; returns events and JSON. */
function runScript(seed: number): {
  json: string;
  events: SimEvent[];
  checksum: number;
  raw: Float32Array;
} {
  const { sim, checksum, raw } = buildSim(seed);
  const cmdRng = new Rng((seed ^ 0x2468ace) >>> 0);
  const events: SimEvent[] = [];
  for (let t = 0; t < TICKS; t++) {
    const cmd = commandFor(cmdRng, t);
    if (cmd) sim.enqueue(cmd);
    events.push(...sim.step());
  }
  return { json: JSON.stringify(sim.snapshot()), events, checksum, raw };
}

describe('full simulation determinism', () => {
  it('same seed and command script give identical snapshots and event streams', () => {
    for (let c = 0; c < CASES; c++) {
      const seed = (BASE_SEED + c * 7919) >>> 0;
      const label = caseLabel('sim-determinism', BASE_SEED, c) + ` seed=${seed}`;
      const a = runScript(seed);
      const b = runScript(seed);
      expect(a.events.length > TICKS, `${label} script produced no non-tick events`).toBe(true);
      expect(a.checksum, `${label} terrain checksum`).toBe(b.checksum);
      expect(sameBytes(a.raw, b.raw), `${label} terrain bytes differ`).toBe(true);
      expect(a.json === b.json, `${label} JSON snapshot differs`).toBe(true);
      expect(JSON.stringify(a.events), `${label} event stream differs`).toBe(
        JSON.stringify(b.events),
      );
    }
  });

  it('a different seed produces a different terrain checksum', () => {
    for (let c = 0; c < CASES; c++) {
      const seed = (BASE_SEED + c * 7919) >>> 0;
      const other = (seed + 1) >>> 0;
      const label =
        caseLabel('sim-seed-sensitivity', BASE_SEED, c) + ` seed=${seed} other=${other}`;
      const a = buildSim(seed);
      const b = buildSim(other);
      expect(a.checksum, `${label} checksums collide`).not.toBe(b.checksum);
    }
  });
});
