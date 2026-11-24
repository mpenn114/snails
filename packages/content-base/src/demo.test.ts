import { describe, expect, it } from 'vitest';
import {
  createMatch,
  generateDemoTerrain,
  loadContentPacks,
  stateChecksum,
  DEFAULT_TERRAIN_CONFIG,
  type MatchSetup,
} from '@snails/core';
import { basePack } from './index.js';

const { registries } = loadContentPacks([basePack]);
const weapons = registries.weapons.list();
const TEAMS = [
  { id: 'a', name: 'A', colour: '#f00' },
  { id: 'b', name: 'B', colour: '#00f' },
];

function demoMatch(seed = 7, crates: 'off' | 'normal' = 'normal'): MatchSetup {
  return createMatch({
    seed,
    teams: TEAMS,
    weapons,
    statuses: registries.statuses.list(),
    areas: registries.areas.list(),
    crates: registries.crates.list(),
    winds: registries.winds.list(),
    settings: { demo: true, wind: 'low', crates },
  });
}

/** Fires `weaponId` from the active snail at a fixed aim and runs the sim for a while. */
function fireAndRun(m: MatchSetup, weaponId: string, steps = 900): void {
  const snailId = m.sim.state.turn.activeSnailId as string;
  m.sim.enqueue({ type: 'aim', snailId, angle: Math.PI / 4, power: 0.7 });
  m.sim.enqueue({ type: 'fire', snailId, weaponId });
  for (let i = 0; i < steps; i++) m.sim.step();
}

describe('Weapons demo match', () => {
  it('unlocks and stocks every weapon for every team', () => {
    const m = demoMatch();
    for (const team of m.sim.state.teams) {
      for (const w of weapons) {
        expect(team.inventory?.[w.id]).toBe(99);
        if (w.requiresTech) expect(team.researched).toContain(w.requiresTech);
      }
    }
  });

  it('honours the startingLoadout setting over the demo stock', () => {
    const m = createMatch({
      seed: 7,
      teams: TEAMS,
      weapons,
      settings: { demo: true, startingLoadout: { 'base:dew-bomb': 2 } },
    });
    expect(m.sim.state.teams[0]?.inventory?.['base:dew-bomb']).toBe(2);
    expect(m.sim.state.teams[0]?.inventory?.['base:pebble-toss']).toBe(99);
  });

  it('has the featured terrain: beach water, pit, ledge, slope and banded block', () => {
    const { grid } = generateDemoTerrain({ ...DEFAULT_TERRAIN_CONFIG });
    const zMid = Math.floor(grid.nz / 2);
    const surface = (xFrac: number): number => {
      const x = Math.round(xFrac * (grid.nx - 1));
      for (let y = grid.ny - 1; y >= 0; y--) {
        if (grid.get(x, y, zMid) < 0) return y * grid.cellSize;
      }
      return -1;
    };
    expect(surface(0.01)).toBeLessThan(DEFAULT_TERRAIN_CONFIG.waterLevel);
    expect(surface(0.2)).toBeGreaterThan(surface(0.01));
    expect(surface(0.4)).toBeGreaterThan(surface(0.2) + 4);
    expect(surface(0.56)).toBeLessThan(surface(0.4));
    expect(surface(0.56)).toBeGreaterThan(surface(0.74));
    expect(surface(0.74)).toBeLessThan(surface(0.6) - 3);
    expect(surface(0.95)).toBeGreaterThan(surface(0.8) + 4);
    const mats = new Set<number>();
    const x = Math.round(0.95 * (grid.nx - 1));
    for (let y = 0; y < grid.ny; y++) mats.add(grid.materials[grid.index(x, y, zMid)] as number);
    expect(mats.has(2) && mats.has(3)).toBe(true);
  });

  it('is deterministic for a seed and places every snail above water', () => {
    expect(stateChecksum(demoMatch(3).sim)).toBe(stateChecksum(demoMatch(3).sim));
    for (const t of demoMatch(3).sim.state.teams) {
      for (const s of t.snails) {
        expect(s.position.y).toBeGreaterThan(DEFAULT_TERRAIN_CONFIG.waterLevel);
      }
    }
  });

  it('keeps crates on even when the crates setting is off', () => {
    const on = demoMatch(7, 'normal');
    const off = demoMatch(7, 'off');
    for (const m of [on, off]) for (let i = 0; i < 60 * 30 * 8; i++) m.sim.step();
    expect(on.sim.state.crates.length).toBeGreaterThan(0);
    expect(stateChecksum(off.sim)).toBe(stateChecksum(on.sim));
  });
});

describe('every base weapon', () => {
  it('covers all 12 base weapons', () => {
    expect(weapons).toHaveLength(12);
  });

  it.each(weapons.map((w) => w.id))('%s fires in the demo match and is deterministic', (id) => {
    const a = demoMatch();
    const b = demoMatch();
    const teamId = a.sim.state.turn.activeTeamId;
    fireAndRun(a, id);
    fireAndRun(b, id);
    const team = a.sim.state.teams.find((t) => t.id === teamId);
    expect(team?.inventory?.[id]).toBe(98);
    expect(stateChecksum(a.sim)).toBe(stateChecksum(b.sim));
  });
});
